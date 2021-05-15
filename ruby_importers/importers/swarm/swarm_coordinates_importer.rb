require_relative "swarm"

module Importers
  class SwarmCoordinatesImporter < Importer
    def import
      clear_prior_rows("swarmCoordinatesLat")
      clear_prior_rows("swarmCoordinatesLng")
      clear_prior_rows("swarmCoordinatesLatLng")

      all = []
      swarm.checkins.each do |checkin|
        timestamp = Time.at(checkin["createdAt"])
        d = swarm.fetch_checkin_detail(checkin)
        l = d["response"]["checkin"]["venue"]["location"]
        all << [
          l.fetch("lat"),
          l.fetch("lng")
        ]
        puts d["response"]["checkin"]["venue"]["name"]
        
        {
          "swarmCoordinatesLat" => l.fetch("lat"),
          "swarmCoordinatesLng" => l.fetch("lng"),
          "swarmCoordinatesLatLng" => [l.fetch("lat"), l.fetch("lng")].join(","),
        }.each do |key, value|
          insert_row_for_timestamp(
            timestamp: timestamp,
            key: key,
            value: value,
            type: key.include?("LatLng") ? "text" : "number",
            question: "Swarm coordinates #{key}"
          )
        end
        
        break if all.count > 100
        puts all.count
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

