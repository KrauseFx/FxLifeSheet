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
    results = database.fetch("SELECT ?, AVG(value::numeric) as avg, SUM(value::numeric) AS sum FROM raw_data WHERE key = ? AND timestamp > ? GROUP BY ? ORDER BY ?", group_by, key, start_timestamp, group_by, group_by)

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
          begin
            year_week = row[:yearweek].to_s
            # TODO
            year_week = (year_week.gsub("53", "01").to_i - 100).to_s if year_week.end_with?("53") # Week 53 can't be parsed by Ruby, messy for now
            row[:as_date] = Date.strptime(year_week, "%Y%W")
          rescue => ex
            require 'pry'; binding.pry
          end
        else
          raise "not yet implemented"
        end

        row
      end
    }
  end

  def list_keys
    raw_keys = raw_data.group_and_count(:key).order_by(:count).reverse.to_a

    # Also, manually add the Swarm categories
    raw_keys += database[:all_swarm_checkin_categories].to_a.collect { |row| {key: "Swarm #{row[:category]}", count: row[:count]} }

    return raw_keys
  end

  def bucket_options_list(by:, start_date:)
    raise "`start_date` must be in format '2019-04'" unless start_date.match(/\d\d\d\d\-\d\d/)
    start_timestamp = Date.strptime(start_date, "%Y-%m").strftime("%Q")

    res = database.fetch("
      SELECT value::numeric, count(*) 
      FROM raw_data
      WHERE key=? AND timestamp > ?
      GROUP BY value
      ORDER BY value
    ", by, start_timestamp)
    return res.to_a.collect do |row|
      row[:value] = row[:value].truncate(5).to_s('F').to_f # convert from BigFloat to float
      row
    end.reverse # have on by default
  end

  def bucket(by:, bucket_border:, start_date:)
    raise "`start_date` must be in format '2019-04'" unless start_date.match(/\d\d\d\d\-\d\d/)
    start_timestamp = Date.strptime(start_date, "%Y-%m").strftime("%Q")
    
    flat = database.fetch("
      SELECT
          (rd.value::numeric > ?) AS bucket,
          nrd.key AS other_key,
          AVG(nrd.value::numeric) AS avg_value,
          COUNT(nrd.id) as count
        FROM raw_data rd
        INNER JOIN raw_data nrd ON (
          (nrd.type != 'text') AND
          abs(rd.timestamp - nrd.timestamp) < 20000000 /* 10000 is one minute */
        )
      WHERE rd.key = ? AND rd.timestamp > ?
      GROUP BY bucket, other_key
      ORDER BY other_key, bucket
    ", bucket_border, by, start_timestamp).to_a

    # Group it properly, easier to just do that in Ruby
    structured = {}
    flat.each do |row|
      next if row[:avg_value].nil? # some rows can be nil
      next if row[:other_key].start_with?("swarmCheckinCoordinatesL")
      next if row[:other_key].start_with?("locationL") # Telegram locations
      next if denylisted_other_keys.include?(row[:other_key])
      next if row[:other_key].start_with?("measurement") # Measurements from Faron

      structured[row[:other_key]] ||= {}
      structured[row[:other_key]][row[:bucket]] = {
        value: row[:avg_value].truncate(5).to_s('F').to_f, # convert from BigFloat to float,
        count: row[:count]
      }
    end

    # Remove the useless ones (e.g. only one value, not large enough buckets)
    structured.delete_if do |key, value|
      value.count < 2 ||
        value.find_all { |k, r| r[:count] > 30 }.count < 2
    end

    return structured
  end

  # Used for GitHub style graphs
  def github_style(key:, start_date:)
    raise "`start_date` must be in format '2019-04'" unless start_date.match(/\d\d\d\d\-\d\d/)
    start_timestamp = Date.strptime(start_date, "%Y-%m").strftime("%Q")
    matched = start_date.match(/(\d\d\d\d)\-(\d\d)/)
    end_date = (matched[1].to_i + 1).to_s + "-" + matched[2]
    end_timestamp = Date.strptime(end_date, "%Y-%m").strftime("%Q")

    if key.start_with?("Swarm ")
      # This is only for Swarm check-ins, since we need to look for the `value`, not the key in those cases
      key = key.gsub("Swarm ", "")
      results = raw_data.where(key: "swarmCheckinCategory", value: key).where{(timestamp > start_timestamp) & (timestamp < end_timestamp)}.order(:timestamp)
    else
      # This is the normal case
      results = raw_data.where(key: key).where{(timestamp > start_timestamp) & (timestamp < end_timestamp)}.order(:timestamp)
    end

    # Excluding where matcheddate is nil, since we didn't run the backfill yet
    final_returns = results.exclude(matcheddate: nil).to_a.collect do |row|
      {
        matchedDateDay: row[:matcheddate].day,
        matchedDateMonth: row[:matcheddate].month,
        matchedDateYear: row[:matcheddate].year,
        matchedDayOfWeek: day_of_week(row[:matcheddate]),
        matchedWeekOfTheYear: row[:matcheddate].cweek,
      }.merge(row)
    end.uniq { |row| row[:matcheddate] }
    # the `.uniq` takes care that we only have one entry per date, which only happens for a few days where
    # time zones got really messy

    # Convert to hash, where the key is the date
    final_returns = final_returns.collect do |entry|
      [entry[:matcheddate], entry]
    end.to_h

    # Backfill empty dates with a nil value, so we can properly render those
    current_date = final_returns.keys.min
    while current_date < final_returns.keys.max
      final_returns[current_date] ||= {
        value: nil,
        matchedDateDay: current_date.day,
        matchedDateMonth: current_date.month,
        matchedDateYear: current_date.year,
        matchedDayOfWeek: day_of_week(current_date),
        matchedWeekOfTheYear: current_date.cweek,
      }
      current_date += 1
    end

    return final_returns
  end

  def pie_data(key:, start_date: nil, end_date: nil)
    puts "Start: #{start_date}"
    puts "End: #{end_date}"
    if start_date.nil? && end_date.nil?
      results = database.fetch("SELECT value, COUNT(*) FROM raw_data WHERE key=? GROUP BY value ORDER BY count DESC", key)
    elsif start_date && end_date
      raise "`start_date` must be in format '2019-04'" unless start_date.match(/\d\d\d\d\-\d\d/)
      raise "`end_date` must be in format '2019-04'" unless end_date.match(/\d\d\d\d\-\d\d/)
      start_timestamp = Date.strptime(start_date, "%Y-%m").strftime("%Q")
      end_timestamp = Date.strptime(end_date, "%Y-%m").strftime("%Q")

      results = database.fetch("SELECT value, COUNT(*) FROM raw_data WHERE key=? AND timestamp >= ? AND timestamp <= ? GROUP BY value ORDER BY count DESC", key, start_timestamp, end_timestamp)
    else
      raise "Something went wrong, we need both a start- and an end date"
    end
    return results.to_a
  end

  def denylisted_other_keys
    ENV["DENYLISTED_OTHER_KEYS"].split(";")
  end

  private

  # Day of week = 1 - 7, Monday is 1
  # We want Sunday to be 0
  def day_of_week(date)    7 - date.cwday
  end

  def database
    raise "missing DATABASE_URL ENV variable" if ENV["DATABASE_URL"].to_s.length == 0
    @_database ||= Sequel.connect(ENV["DATABASE_URL"])
  end

  def raw_data
    database[:raw_data]
  end
end

if __FILE__ == $0
  puts API.new.bucket(
    by: "gym",
    value: "steps",
    start_date: ENV["DEFAULT_MIN_DATE"].strip
  )
end