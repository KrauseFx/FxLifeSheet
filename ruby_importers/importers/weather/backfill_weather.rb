require_relative '../importer'
require 'net/http'

module Importers
  class BackfillWeather < Importer
    def import
      all = []

      # Start with the date on when we most recently ran this script
      current_date = (Time.at(raw_data.where(
        key: "weatherTemperature",
      ).order(:timestamp).last[:timestamp] / 1000) - 1 * 24 * 60 * 60).to_date

      previously_used_lat = nil
      previously_used_lng = nil

      while current_date < Date.today - 2 # to get the "tomorrow" and "yesterday" data also
        # First, check if we have a precise location from Telegram, which is the preferred way of getting the location
        telegram_lat = raw_data.where(key: "locationLat").where(matcheddate: current_date).first
        telegram_lng = raw_data.where(key: "locationLng").where(matcheddate: current_date).first

        if telegram_lat && telegram_lng
          lat = telegram_lat[:value]
          lng = telegram_lng[:value]

          # No need to call `store_lat_lng_used``
          # As we already have the Telegram location
          pull_weather(lat: lat, lng: lng, matched_date: current_date)
          previously_used_lat = lat
          previously_used_lng = lng
        else
          # Only if we don't have a Telegram location, we will use the last Swarm check-in location
          # Get the most recent location entry for the current date
          checkins_that_day = raw_data.where(key: "swarmCheckinCoordinatesLatLng").where(matcheddate: current_date)

          if checkins_that_day.count >= 1
            lat, lng = checkins_that_day.order(:timestamp).last[:value].split(",")
          else
            lat = previously_used_lat
            lng = previously_used_lng
          end

          store_lat_lng_used(lat: lat, lng: lng, matched_date: current_date)
          pull_weather(lat: lat, lng: lng, matched_date: current_date)
          previously_used_lat = lat
          previously_used_lng = lng
        end
        current_date += 1
      end

      # TODO: also add "yesterday" and "tomorrow" for weather
    end

    # Store the "final" lat/lng used for that day, which we can then use
    # to fetch the city and country information for that day
    # Every time we already have the Telegram location, we don't do anything
    # if we don't have the Telegram location, we backfill based on the most
    # recent swarm checkin
    def store_lat_lng_used(lat:, lng:, matched_date:)
      puts "backfilling location for date #{matched_date}"

      insert_row_for_date(
        key: "locationLat", 
        value: lat,
        date: matched_date,
        type: "number",
        question: "Please share your location, this is used to get your city, country, continent, currency, and weather details",
        source: "backfill_weather", 
        import_id: import_id
      )

      insert_row_for_date(
        key: "locationLng", 
        value: lng,
        date: matched_date,
        type: "number",
        question: "Please share your location, this is used to get your city, country, continent, currency, and weather details",
        source: "backfill_weather", 
        import_id: import_id
      )
    end

    def pull_weather(lat:, lng:, matched_date:)
      puts "Pulling historic weather data for #{lat} #{lng}"
      id = "#{lat}_#{lng}_#{matched_date}"

      if weather_cache[id]
        puts "Got weather for #{lat} #{lng} #{matched_date} from cache"
        store_weather_in_db(weather: weather_cache[id], matched_date: matched_date)
      else
        puts "Pulling weather for #{lat} #{lng} #{matched_date}"
        url = URI("https://visual-crossing-weather.p.rapidapi.com/history?startDateTime=#{matched_date}T00%3A00%3A00&aggregateHours=24&location=#{lat}%2C#{lng}&endDateTime=#{matched_date}T23%3A59%3A59&unitGroup=metric&contentType=json&shortColumnNames=false")
        http = Net::HTTP.new(url.host, url.port)
        http.use_ssl = true
        request = Net::HTTP::Get.new(url)
        request["x-rapidapi-host"] = 'visual-crossing-weather.p.rapidapi.com'
        request["x-rapidapi-key"] = ENV.fetch("RAPID_API_KEY")
        response = http.request(request)
        parsed_json = JSON.parse(response.read_body)
        if parsed_json["locations"].nil?
          puts "ran out of weather API quota..."
          binding.pry
          return
        end
        add_to_weather_cache(id, parsed_json)
        store_weather_in_db(weather: parsed_json, matched_date: matched_date)
      end
    end

    def store_weather_in_db(weather:, matched_date:)
      weather = weather["locations"].values.first.fetch("values").first

      {
        "CloudCover" => "cloudcover",
        "Temperature" => "temp",
        "TemperatureMax" => "maxt",
        "TemperatureMin" => "mint",
        "Precipitation" => "precip",
        "PrecipitationCover" => "precipcover",
        "SnowDepth" => "snowdepth",
        "Snow" => "snow",
        "Visibility" => "visibility",
        "SolarEnergy" => "solarenergy",
        "Humidity" => "humidity",
        "SolarRadiation" => "solarradiation",
        "WindSpeed" => "wspd",
        "SeaLevelPressure" => "sealevelpressure",
      }.each do |key, value|
        insert_weather_row(key, weather.fetch(value), matched_date, type: "number")
      end

      {
        "WeatherType" => "weathertype",
        "Conditions" => "conditions"
      }.each do |key, value|
        insert_weather_row(key, weather.fetch(value), matched_date, type: "text")
      end
    end

    private
    def insert_weather_row(key, value, date, type: "number")
      raise "missing key for value #{value}" if key.to_s.length == 0

      insert_row_for_date(
        key: "weather#{key}", 
        value: value, 
        date: date, 
        type: type,
        question: "Weather #{key}",
        source: "backfill_weather", 
        import_id: import_id
      )
    end

    def weather_cache
      @weather_cache ||= File.exist?("_weather_cache.json") ? JSON.parse(File.read("_weather_cache.json")) : {}
      return @weather_cache
    end

    def add_to_weather_cache(id, body)
      puts "storing in weather cache #{id}"
      s = weather_cache
      s[id] = body
      File.write("_weather_cache.json", JSON.pretty_generate(s))
      return s
    end

    def import_id
      @_import_id ||= SecureRandom.hex
    end
  end
end

if __FILE__ == $0
  Importers::BackfillWeather.new.import
end

