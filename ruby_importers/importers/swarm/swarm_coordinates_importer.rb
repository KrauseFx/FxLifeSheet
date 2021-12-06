require_relative "swarm"
require_relative '../importer'

module Importers
  class SwarmCoordinatesImporter < Importer
    def import
      import_id = SecureRandom.hex
      all = []

      swarm.checkins.each do |checkin|
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

        # TODO: Update script to speed up importing new data
        # the checkins.json file is sorted with the most recent checkins first
        # so we can just stop importing once we hit an existing checkin, once 
        # the initial import is complete
        
        category = Hash(venue["categories"].find { |a| a["primary"] == true })["name"]
        category = "Gym" if category && category.include?("Gym") # since we also have "Gym / Fitness Center"
        location = venue["location"]
        timezone_offset = d["response"]["checkin"]["timeZoneOffset"]

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
    end

    def swarm
      @_swarm ||= Swarm.new
    end  
  end
end

if __FILE__ == $0
  Importers::SwarmCoordinatesImporter.new.import
end

