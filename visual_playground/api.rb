require "sequel"
require "pry"
require "date"
require "json"

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

  def bucket_options_list(by:, start_date:, numeric:)
    raise "`start_date` must be in format '2019-04'" unless start_date.match(/\d\d\d\d\-\d\d/)
    start_timestamp = Date.strptime(start_date, "%Y-%m").strftime("%Q")

    numeric_string = numeric ? "::numeric" : ""
    order_by = numeric ? "value" : "COUNT(*)"
    res = database.fetch("
      SELECT value#{numeric_string}, COUNT(*) 
      FROM raw_data
      WHERE key=? AND timestamp > ?
      GROUP BY value
      ORDER BY #{order_by}
    ", by, start_timestamp)

    return res.to_a.collect do |row|
      if numeric
        row[:value] = row[:value].truncate(5).to_s('F').to_f # convert from BigFloat to float
      end
      row
    end.reverse # have on by default
  end

  def bucket(by:, bucket_border:, start_date:, numeric:)
    raise "`start_date` must be in format '2019-04'" unless start_date.match(/\d\d\d\d\-\d\d/)
    start_timestamp = Date.strptime(start_date, "%Y-%m").strftime("%Q")
    
    numeric_string = numeric ? "::numeric > " : "="
    flat = database.fetch("
      SELECT
          (rd.value#{numeric_string}?) AS bucket,
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
      next if row[:other_key].start_with?("rescue_time_application_")
      next if row[:other_key].start_with?("swarmCheckinCoordinatesL")
      next if row[:other_key].start_with?("swarmCheckinTimezone")
      next if row[:other_key].start_with?("locationL") # Telegram locations
      next if denylisted_other_keys.include?(row[:other_key])
      next if row[:other_key].start_with?("measurement") # Measurements from Faron
      next if row[:other_key].start_with?("learnedSpanish")
      next if row[:other_key].start_with?("practicedSpeaking")
      next if row[:other_key].start_with?("dateSeasonIs") # not useful
      next if row[:other_key] == "rescue_time_category_Uncategorized"

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
    year_to_use = matched[1].to_i

    end_date = (year_to_use + 1).to_s + "-" + matched[2]
    end_date = Date.strptime(end_date, "%Y-%m") + 1 # plus 1 day, since otherwise the last day might be cut off
    end_timestamp = end_date.strftime("%Q")

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
      week_of_the_year = row[:matcheddate].cweek
      week_of_the_year -= 53 if week_of_the_year > 52
      {
        matchedDateDay: row[:matcheddate].day,
        matchedDateMonth: row[:matcheddate].month,
        matchedDateYear: row[:matcheddate].year,
        matchedDayOfWeek: day_of_week(row[:matcheddate]),
        matchedWeekOfTheYear: week_of_the_year,
      }.merge(row)
    end.uniq { |row| row[:matcheddate] }.keep_if { |a| a[:matchedDateYear].to_i == year_to_use}
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
      return {
        year: database.fetch("SELECT value, COUNT(*) FROM raw_data WHERE key=? GROUP BY value ORDER BY count DESC", key).to_a
      }
    elsif start_date && end_date
      raise "`start_date` must be in format '2019-04'" unless start_date.match(/\d\d\d\d\-\d\d/)
      raise "`end_date` must be in format '2019-04'" unless end_date.match(/\d\d\d\d\-\d\d/)
      start_timestamp = Date.strptime(start_date, "%Y-%m").strftime("%Q")
      end_timestamp = Date.strptime(end_date, "%Y-%m").strftime("%Q")

      return {
        year: database.fetch("SELECT value, COUNT(*) FROM raw_data WHERE key=? AND timestamp >= ? AND timestamp <= ? GROUP BY value ORDER BY count DESC", key, start_timestamp, end_timestamp).to_a,
        months: (0...12).collect do |i|
          month_start = Date.strptime(start_date, "%Y-%m").next_month(i).strftime("%Q")
          month_end = Date.strptime(start_date, "%Y-%m").next_month(i + 1).strftime("%Q")
          puts "from #{Date.strptime(start_date, "%Y-%m").next_month(i)} to #{Date.strptime(start_date, "%Y-%m").next_month(i + 1)}"
          [
            (i + 1), # the current month as key
            database.fetch("SELECT value, COUNT(*) FROM raw_data WHERE key=? AND timestamp >= ? AND timestamp <= ? GROUP BY value ORDER BY count DESC", key, month_start, month_end).to_a
          ]
        end.to_h
      }
    else
      raise "Something went wrong, we need both a start- and an end date"
    end
  end

  def denylisted_other_keys
    ENV["DENYLISTED_OTHER_KEYS"].to_s.split(";")
  end

  # Returns slightly obfuscated lat/lng coordinates of the location
  # I was at at a specific date
  def where_at(date:)
    result = raw_data.where(
      matcheddate: date,
      key: [
        "locationLat",
        "locationLng",
        "locationInfoCity",
        "locationInfoCountry",
        "locationInfoContinent"
      ]
    ).order(:timestamp).limit(5)

    lat = result.find { |row| row[:key] == "locationLat" }[:value].to_f.round(1)
    lng = result.find { |row| row[:key] == "locationLng" }[:value].to_f.round(1)
    city = result.find { |row| row[:key] == "locationInfoCity" }[:value]
    raise "Missing `DENYLISTED_CITIES` value" if ENV["DENYLISTED_CITIES"].to_s.length == 0
    city = "Redacted" if ENV["DENYLISTED_CITIES"].split(";").include?(city)
    binding.pry if city == "Redacted"
    country = result.find { |row| row[:key] == "locationInfoCountry" }[:value]
    continent = result.find { |row| row[:key] == "locationInfoContinent" }[:value]

    return { lat: lat, lng: lng, city: city, country: country, continent: continent }
  end

  private

  # Day of week = 1 - 7, Monday is 1
  # We want Sunday to be 0
  def day_of_week(date)
    7 - date.cwday
  end

  def database
    raise "missing DATABASE_URL ENV variable" if ENV["DATABASE_URL"].to_s.length == 0
    @_database ||= Sequel.connect(ENV["DATABASE_URL"])
  end

  def raw_data
    database[:raw_data]
  end
end

# Running this will generate a JSON file for all dates and the historic locations
def generate_historic_locations
  api = API.new
  current_date = Date.new(2019, 04, 12)
  output = {}
  coordinates_only = []
  csv = []
  while current_date <= Date.new(2021, 12, 31) # Date.today - 7
    puts "Fetching date details for #{current_date}"
    result = api.where_at(date: current_date)
    if result
      output[current_date] = result
      coordinates_only << [
        result[:lat],
        result[:lng]
      ]
      csv << [
        result[:lat],
        result[:lng],
        current_date.strftime("%Y-%m-%d") + " - " + result[:city],
        "#FFFF00"
      ].join(",")
    end

    current_date += 1
  end

  File.write("historic_locations.json", JSON.pretty_generate(output))
  File.write("historic_locations_coordinates_only.json", JSON.pretty_generate(coordinates_only))
  File.write("historic_locations.csv", csv.join("\n"))
  puts "Successfully generated ./historic_locations.json"
end

if __FILE__ == $0
  # puts API.new.pie_data(
  #   key: "swarmCheckinAddressCity",
  # )
  # puts JSON.pretty_generate(API.new.bucket(
  #   by: "livingSituation",
  #   bucket_border: "Nomad",
  #   start_date: ENV["DEFAULT_MIN_DATE"].strip,
  #   numeric: false
  # ))

  generate_historic_locations  
end
