require "sequel"
require "pry"
require "date"

class API
  def fetch(key:, group_by:, start_date:)
    # 
    # Modify and verify parameters
    # 
    group_by = "year#{group_by}" unless group_by.include?("year")
    group_by = group_by.to_sym
    raise "Invalid group_by" unless [:yearmonth, :yearweek].include?(group_by)

    raise "`start_date` must be in format '2019-04'" unless start_date.match(/\d\d\d\d\-\d\d/)
    start_timestamp = Date.strptime(start_date, "%Y-%m").strftime("%Q")

    # 
    # Run the query
    # 
    results = database.fetch("SELECT ?, AVG(value::numeric) as avg, SUM(value::numeric) as sum from raw_data where key = ? AND timestamp > ? GROUP BY ? ORDER BY ?", group_by, key, start_timestamp, group_by, group_by)

    # 
    # Return the results
    # 
    return {
      total_count: raw_data.where(key: key).count,
      grouped_count: results.count,
      rows: results.to_a.collect do |row|
        row[:avg] = row[:avg].truncate(5).to_s('F').to_f # convert from BigFloat to float
        row[:sum] = row[:sum].truncate(5).to_s('F').to_f # convert from BigFloat to float
        if group_by == :yearmonth
          row[:as_date] = Date.strptime(row[:yearmonth].to_s, "%Y%m")
        elsif group_by == :yearweek
          row[:as_date] = Date.strptime(row[:yearweek].to_s, "%Y%W")
        else
          raise "not yet implemented"
        end

        row
      end
    }
  end

  def list_keys
    return raw_data.group_and_count(:key).order_by(:count).reverse.to_a
  end

  private

  def database
    raise "missing DATABASE_URL ENV variable" if ENV["DATABASE_URL"].to_s.length == 0
    @_database ||= Sequel.connect(ENV["DATABASE_URL"])
  end

  def raw_data
    database[:raw_data]
  end
end

if __FILE__ == $0
  puts API.new.fetch(key: "mood")
end
