require "sequel"
require "pry"
require "date"

class API
  def fetch(key:, group_by:, start_date:)
    group_by = "year#{group_by}" unless group_by.include?("year")
    group_by = group_by.to_sym
    raise "Invalid group_by" unless [:yearmonth, :yearweek].include?(group_by)

    # TODO: Filter start date
    results = database.fetch("SELECT ?, AVG(value::numeric) as avg from raw_data where key = ? GROUP BY ? ORDER BY ?", group_by, key, group_by, group_by)

    return {
      total_count: raw_data.where(key: key).count,
      grouped_count: results.count,
      rows: results.to_a.collect do |row|
        row[:avg] = row[:avg].truncate(5).to_s('F').to_f # convert from BigFloat to float
        if group_by == :yearmonth
          row[:as_date] = Date.strptime(row[:yearmonth].to_s, "%Y%m")
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
