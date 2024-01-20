require_relative '../importer'
require 'net/http'

module Importers
  class BackfillFacebookLocation < Importer
    def import

      # {
      #   "name": "San Diego",
      #   "coordinate": {
      #     "latitude": 32.76469,
      #     "longitude": -117.06252
      #   },
      #   "creation_timestamp": 1568650726
      # }
      #
      threads = []
      location_history.reverse.each do |location|
        threads << Thread.new do
          store_location(location)
        end

        if threads.length > 6
          puts "Waiting for threads tobe complete..."
          sleep(4.5 + rand * 10) # sleeping to not over connect to the db
          threads.each(&:join)
          threads = []
        end
      end
    end

    def store_location(location)
      timestamp = Time.at(location["creation_timestamp"])
      matched_date = timestamp.to_date
      puts "backfilling location for date #{matched_date}"
      coordinate = location["coordinate"]
      lat = coordinate["latitude"]
      lng = coordinate["longitude"]
      city = location["name"]

      insert_row_for_date(
        key: "locationLat", 
        value: lat,
        date: matched_date,
        type: "number",
        question: "Please share your location, this is used to get your city, country, continent, currency, and weather details",
        source: "facebook",
        import_id: import_id,
        force_match: true
      )

      insert_row_for_date(
        key: "locationLng",
        value: lng,
        date: matched_date,
        type: "number",
        question: "Please share your location, this is used to get your city, country, continent, currency, and weather details",
        source: "facebook",
        import_id: import_id,
        force_match: true
      )

      insert_row_for_date(
        key: "locationInfoCity",
        value: city,
        date: matched_date,
        type: "text",
        question: "Location Info City",
        source: "facebook",
        import_id: import_id
      )
    end

    def location_history
      @location_file ||= JSON.parse(File.read(File.join("importers", "facebook", "facebook-export", "location", "location_history.json")))["location_history"]
    end

    def import_id
      @_import_id ||= SecureRandom.hex
    end
  end
end

if __FILE__ == $0
  Importers::BackfillFacebookLocation.new.import
end
