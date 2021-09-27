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
    return raw_data.group_and_count(:key).order_by(:count).reverse.to_a
  end

  def bucket_options_list(by:, start_date:)
    raise "`start_date` must be in format '2019-04'" unless start_date.match(/\d\d\d\d\-\d\d/)
    start_timestamp = Date.strptime(start_date, "%Y-%m").strftime("%Q")

    res = database.fetch("
      SELECT value, count(*) 
      FROM raw_data
      WHERE key=? AND timestamp > ?
      GROUP BY value
    ", by, start_timestamp)
    return res.to_a.reverse # have on by default
  end

  def bucket(by:, start_date:)
    raise "`start_date` must be in format '2019-04'" unless start_date.match(/\d\d\d\d\-\d\d/)
    start_timestamp = Date.strptime(start_date, "%Y-%m").strftime("%Q")
    
    flat = database.fetch("
      SELECT
          rd.value AS bucket,
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
    ", by, start_timestamp).to_a

    # Group it properly, easier to just do that in Ruby
    structured = {}
    flat.each do |row|
      next if row[:avg_value].nil? # some rows can be nil
      next if row[:other_key].include?("swarmLocation") || row[:other_key].include?("locationL") || ["weight"].include?(row[:other_key])
      next if denylisted_other_keys.include?(row[:other_key])

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
  puts API.new.bucket(
    by: "gym",
    value: "steps",
    start_date: ENV["DEFAULT_MIN_DATE"].strip
  )
end



# SELECT 
# 	raw_data.value,
# 	(
# 		SELECT AVG(
# 			(
# 				SELECT AVG(value::numeric) as avg FROM raw_data AS rdd 
# 				WHERE rd.key = 'fishoilIntake' AND timestamp > 1554076800000
# 			)
# 		) as avg
# 		FROM raw_data AS rd
# 		WHERE rd.key = 'gym' AND timestamp > 1554076800000 AND rd.value = raw_data.value
# 	) AS avg
# FROM raw_data WHERE key = 'gym' AND timestamp > 1554076800000 GROUP BY raw_data.value



# SELECT
# 	raw_data.value AS bucket,
# 	(
# 		SELECT 
# 			rd.value
# 		FROM raw_data rd
# 		WHERE key = 'fishoilIntake' 
# 		AND timestamp > 1554076800000 
# 		ORDER BY abs(rd.timestamp - raw_data.timestamp) ASC 
# 		LIMIT 1	
# 	)
# FROM raw_data raw_data
# WHERE key = 'gym' AND timestamp > 1554076800000


# SELECT AVG(value::numeric) as avg from raw_data where key='fishoilIntake'


# SELECT 
# 	raw_data.value AS bucket
# 	(
# 		SELECT 
# 			rd.value
# 		FROM raw_data rd
# 		WHERE key = 'fishoilIntake' 
# 		AND timestamp > 1554076800000 
# 		ORDER BY abs(rd.timestamp - raw_data.timestamp) ASC 
# 		LIMIT 1	
# 	)
	
# FROM raw_data
# WHERE key = 'gym'
# GROUP BY raw_data.value


# SELECT
#       rd.value AS bucket,
#       nrd.key AS other_key,
#       AVG(nrd.value::numeric) AS avg_value,
#       COUNT(nrd.id) as count
#   FROM raw_data rd
#   INNER JOIN raw_data nrd ON (
#     (nrd.type != 'text') AND
#   	abs(rd.timestamp - nrd.timestamp) < 20000000 /* 10000 is one minute */
#   )
# WHERE rd.key = 'headache' AND rd.timestamp > 1554076800000
# GROUP BY bucket, other_key
# ORDER BY other_key, bucket


# flat = database.fetch("
#   SELECT
#   raw_data.value AS bucket,
#   (
#     SELECT 
#       rd.value
#     FROM raw_data rd
#     WHERE key = 'fishoilIntake' 
#     AND timestamp > 1554076800000 
#     ORDER BY abs(rd.timestamp - raw_data.timestamp) ASC 
#     LIMIT 1	
#   )
#   FROM raw_data raw_data
#   WHERE key = 'gym' AND timestamp > 1554076800000
# ")