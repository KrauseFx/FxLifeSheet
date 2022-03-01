require_relative "swarm"
require_relative '../importer'

module Importers
  class SwarmCoordinatesImporter < Importer
    def import
      import_id = SecureRandom.hex
      all = []
      csv = []

      most_recently_imported_swarm_checkin_timestamp = Time.at(raw_data.where(
        key: "swarmCheckinCoordinatesLatLng",
      ).order(:timestamp).last[:timestamp] / 1000)

      # We're doing reverse, so we start at the oldest, non-imported check-in first
      # so that if the script gets interrupted, we can just run it again
      swarm.checkins.reverse.each do |checkin|
        all_threads_for_this_checkin = []
        timestamp = Time.at(checkin["createdAt"])

        d = swarm.fetch_checkin_detail(checkin)
        next if d.nil?
        venue = d["response"]["checkin"]["venue"]
        l = venue["location"]
        all << [
          l.fetch("lat"),
          l.fetch("lng")
        ]
        csv << [
          l.fetch("lat"),
          l.fetch("lng"),
          timestamp.strftime("%Y-%m-%d")
        ].join(",")

        # This has to happen after the `all <<`
        if timestamp < most_recently_imported_swarm_checkin_timestamp
          puts "Already imported checkins from #{most_recently_imported_swarm_checkin_timestamp}"
          puts "If you want to re-import all Swarm check-ins, make sure to disable that code"
          next
        end
        
        category = Hash(venue["categories"].find { |a| a["primary"] == true })["name"]
        category = "Gym" if category && category.include?("Gym") # since we also have "Gym / Fitness Center"
        location = venue["location"]
        timezone_offset = d["response"]["checkin"]["timeZoneOffset"]
        location["city"] = "New York" if location["city"] == "Brooklyn"

        {
          "swarmCheckinCoordinatesLat" => l.fetch("lat"),
          "swarmCheckinCoordinatesLng" => l.fetch("lng"),
          "swarmCheckinCoordinatesLatLng" => [l.fetch("lat"), l.fetch("lng")].join(","),
          "swarmCheckinCategory" => category,
          "swarmCheckinName" => venue["name"],
          "swarmCheckinTimezone" => timezone_offset,
          # Address
          "swarmCheckinAddressAddress" => location["address"],
          "swarmCheckinAddressCity" => location["city"],
          "swarmCheckinAddressState" => location["state"],
          "swarmCheckinAddressCountry" => location["country"],
          "swarmCheckinAddressPostalCode" => location["postalCode"],
          "swarmCheckinAddressCC" => location["cc"]
        }.each do |key, value|
          next if value.to_s.length == 0 # e.g. no category

          all_threads_for_this_checkin << Thread.new do
            insert_row_for_timestamp(
              timestamp: timestamp,
              key: key,
              value: value,
              type: ["swarmCheckinCoordinatesLat", "swarmCheckinCoordinatesLng", "swarmCheckinTimezone"].include?(key) ? "number" : "text",
              question: "Swarm coordinates #{key}",
              source: "importer_swarm",
              import_id: import_id,
              matched_date: (timestamp + timezone_offset * 60).to_date
            )
          end

          # For the matched_date I did some investigation on check-ins on the West Coast
          # and also found a bug in the Swarm app, where when they render just the date
          # they forget to use the timezone offset. Used on the example of the Swarm checkin
          # with the ID of "5e496619a526b30008affda7"
        end

        puts "Waiting for threads to be complete..."
        all_threads_for_this_checkin.each(&:join)
      end
      File.write("tracks.json", JSON.pretty_generate(all))
      File.write("maps.co.csv", csv.join("\n"))    

      # Now verify the total number of checkins matches
      # the number of checkins in the database (this is a sanity check)

      if (raw_data.where(key: "swarmCheckinCoordinatesLatLng").count - all.count).abs > 3 # 3 for now since we seem to miss 2 points
        binding.pry
        raise "Sanity check has failed..."
      end
    end

    def swarm
      @_swarm ||= Swarm.new
    end  
  end
end

if __FILE__ == $0
  Importers::SwarmCoordinatesImporter.new.import
end

