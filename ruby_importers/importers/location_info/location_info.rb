require_relative '../importer'
require 'net/http'

module Importers
  class BackfillLocationInfo < Importer
    def import
      current_date = Date.new(2020, 11, 27)
      all_locations = []

      while current_date < Date.today - 2 # same as `backfill_weather.rb`
        puts "Location info for #{current_date}..."
        telegram_lat = raw_data.where(key: "locationLat").where(matcheddate: current_date).first
        telegram_lng = raw_data.where(key: "locationLng").where(matcheddate: current_date).first

        
        if telegram_lat && telegram_lng
          all_locations << [telegram_lat[:value], telegram_lng[:value]]
          pull_location_info(lat: telegram_lat[:value], lng: telegram_lng[:value], matched_date: current_date)
        else
          unless [Date.new(2021, 03, 06), Date.new(2021, 06, 28), Date.new(2021, 6, 29), Date.new(2019, 8, 2), Date.new(2019, 10, 11)].include?(current_date)
            binding.pry
            # TODO: Once we ran `backfill_weather.rb` this shouldn't be an issue anymore
            # raise "This should not happen, make sure to run the other scripts also"
          end
        end
        current_date += 1
      end

      File.write("location_info_per_day.json", JSON.pretty_generate(all_locations))
    end

    def pull_location_info(lat:, lng:, matched_date:)
      puts "Pulling historic location info data for #{lat} #{lng}"
      id = "#{lat}_#{lng}_#{matched_date}"

      if location_info_cache[id]
        puts "Got location info for #{lat} #{lng} #{matched_date} from cache"
        store_location_info_in_db(location_info: location_info_cache[id], matched_date: matched_date)
      else
        puts "Pulling location info for #{lat} #{lng} #{matched_date}"
        url = URI("https://google-maps-geocoding.p.rapidapi.com/geocode/json?latlng=#{lat},#{lng}&language=en")
        http = Net::HTTP.new(url.host, url.port)
        http.use_ssl = true
        request = Net::HTTP::Get.new(url)
        request["x-rapidapi-host"] = 'google-maps-geocoding.p.rapidapi.com'
        request["x-rapidapi-key"] = ENV.fetch("RAPID_API_KEY")
        response = http.request(request)
        parsed_json = JSON.parse(response.read_body)
        if parsed_json["results"].count < 3
          puts "ran out of location API quota..."
          binding.pry
          return
        end
        add_to_location_info_cache(id, parsed_json)
        store_location_info_in_db(location_info: parsed_json, matched_date: matched_date)
      end
    end

    def store_location_info_in_db(location_info:, matched_date:)
      result = location_info["results"][0]
      address_components = result["address_components"]
      country = address_components.find { |c| c["types"].include?("country") }["long_name"]
      continent = case country
        when "United States", "Canada" then "North America"
        when "Argentina", "Mexico" then "North America"
        when "Austria", "Norway", "Slovenia", "Germany", "Croatia", "Italy", "France", "Spain", "United Kingdom", "Iceland", "Vatican City", "Turkey" then "Europe"
        when "Taiwan" then "Asia"
      end
      if continent.nil?
        binding.pry
        raise "Missing continent"
      end
      city = Hash(address_components.find { |c| c["types"].include?("locality") })["long_name"]
      city ||= Hash(location_info["results"][1]["address_components"].find { |c| c["types"].include?("locality") })["long_name"]

      {
        "Country" => country,
        "City" => city,
        "County" => Hash(address_components.find { |c| c["types"].include?("administrative_area_level_2") })["long_name"],
        "FullAddress" => result["formatted_address"],
        "Continent" => continent,
      }.each do |key, value|
        insert_location_info_row(key, value, matched_date, type: "text") unless value.nil?
      end
    rescue => ex
      binding.pry
    end

    private
    def insert_location_info_row(key, value, date, type: "number")
      raise "missing key for value #{value}" if key.to_s.length == 0

      insert_row_for_date(
        key: "locationInfo#{key}", 
        value: value, 
        date: date, 
        type: type,
        question: "Location Info #{key}",
        source: "location_info", 
        import_id: import_id
      )
    end

    def location_info_cache
      @location_info_cache ||= File.exist?("_location_info_cache.json") ? JSON.parse(File.read("_location_info_cache.json")) : {}
      return @location_info_cache
    end

    def add_to_location_info_cache(id, body)
      puts "storing in location info cache #{id}"
      s = location_info_cache
      s[id] = body
      File.write("_location_info_cache.json", JSON.pretty_generate(s))
      return s
    end

    def import_id
      @_import_id ||= SecureRandom.hex
    end
  end
end

if __FILE__ == $0
  Importers::BackfillLocationInfo.new.import
end
