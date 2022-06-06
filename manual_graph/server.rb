require "json"
require "sinatra"
require "sequel"
require "pry"

class Server
  def initialize
    @semaphore = Mutex.new
  end

  def fetch(key:, start_date:)
    raise "Invalid start date" unless start_date.match(/\d{4}-\d{2}-\d{2}/)

    date = Date.new(start_date.split("-")[0].to_i, start_date.split("-")[1].to_i, start_date.split("-")[2].to_i)
    result = {}
    while date < Date.today - 1
      date += 1
      puts "fetch data for #{date} for key #{key}"
      result[date] = process_date(date, key)
    end
    
    return result
  end

  def process_date(date, key)
    cache_key = "#{date}_#{key}"
    return cache[cache_key] if cache.key?(cache_key)

    # raise "invalid key" unless key.match(/^[[:alpha:][:blank:]]+$/)
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

    res = db[query].to_a.first.collect { |k, v| [k, v ? v.to_f : nil] }.to_h # convert BigFloat
    cache[cache_key] = res
    store_cache_to_disk(cache_key, res)
    return res
  end

  def db
    @_db ||= Sequel.connect(ENV.fetch("DATABASE_URL"))
  end

  def raw_data
    @_raw_data ||= db[:raw_data]
  end

  def cache
    @_cache ||= File.exist?(cache_path) ? JSON.parse(File.read(cache_path)) : {}
  end

  def store_cache_to_disk(cache_key, res)
    @semaphore.synchronize do
      cache = JSON.parse(File.read(cache_path))
      cache[cache_key] = res
      File.write(cache_path, cache.to_json)
    end
  end

  def cache_path
    "_cache.json"
  end
end



# Sinatra API get request for JSON data
server = Server.new
get '/' do
  content_type 'application/json'
  response['Access-Control-Allow-Origin'] = '*'

  server.fetch(
    key: params.fetch("key"),
    start_date: params.fetch("start_date"),
  ).to_json
end

get "/keys" do
  content_type 'application/json'
  response['Access-Control-Allow-Origin'] = '*'

  raw_keys = server.raw_data.group_and_count(:key).order_by(:count).reverse.to_a
  raw_keys = raw_keys.keep_if { |k| !k[:key].start_with?("rescue_time_") }

  raw_keys.to_json
end

