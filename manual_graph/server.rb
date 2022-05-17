require "json"
require "sinatra"
require "sequel"
require "pry"

class Server
  def fetch(key:)
    return cache[key] if cache.key?(key)

    date = Date.new(2020, 1, 1)
    result = {}
    while date < Date.today - 1
      date += 1
      puts "fetch data for #{date}"
      result[date] = process_date(date, key)
    end
    cache[key] = result
    return result
  end

  def process_date(date, key)
    raise "invalid key" unless key.match(/^[[:alpha:][:blank:]]+$/)
    # Find the timestamp of the end of a given day
    eod_timestamp = (date + 1).to_time.to_i * 1000

    day_timestamp = date.to_time.to_i * 1000
    week_timestamp = (date - 7).to_time.to_i * 1000
    month_timestamp = (date - 30).to_time.to_i * 1000
    quarter_timestamp = (date - 90).to_time.to_i * 1000
    year_timestamp = (date - 365).to_time.to_i * 1000
    all_time_timestamp = 0

    query = "SELECT "
    query += "(SELECT ROUND(AVG(value::numeric), 4) FROM raw_data WHERE timestamp > #{day_timestamp} AND timestamp <= #{eod_timestamp} AND key='#{key}') as day,"
    query += "(SELECT ROUND(AVG(value::numeric), 4) FROM raw_data WHERE timestamp > #{week_timestamp} AND timestamp <= #{eod_timestamp} AND key='#{key}') as week,"
    query += "(SELECT ROUND(AVG(value::numeric), 4) FROM raw_data WHERE timestamp > #{month_timestamp} AND timestamp <= #{eod_timestamp} AND key='#{key}') as month,"
    query += "(SELECT ROUND(AVG(value::numeric), 4) FROM raw_data WHERE timestamp > #{quarter_timestamp} AND timestamp <= #{eod_timestamp} AND key='#{key}') as quarter,"
    query += "(SELECT ROUND(AVG(value::numeric), 4) FROM raw_data WHERE timestamp > #{year_timestamp} AND timestamp <= #{eod_timestamp} AND key='#{key}') as year,"
    query += "(SELECT ROUND(AVG(value::numeric), 4) FROM raw_data WHERE timestamp > #{all_time_timestamp} AND timestamp <= #{eod_timestamp} AND key='#{key}') as all_time"

    return db[query].to_a.first.collect { |k, v| [k, v ? v.to_f : nil] }.to_h # convert BigFloat
  end

  def db
    @_db ||= Sequel.connect(ENV.fetch("DATABASE_URL"))
  end

  def raw_data
    @_raw_data ||= db[:raw_data]
  end

  def cache
    @_cache ||= {}
  end
end



# Sinatra API get request for JSON data
server = Server.new
get '/' do
  content_type 'application/json'
  response['Access-Control-Allow-Origin'] = '*'

  server.fetch(key: params.fetch("key")).to_json
end

