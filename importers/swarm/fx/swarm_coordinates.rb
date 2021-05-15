require 'json'
require 'excon'
require 'date'
require 'pry'

class SwarmCoordinates
  def checkins
    @checkins ||= JSON.parse(File.read("checkins.json"))["items"]
  end

  def swarm_cache
    @swarm_cache ||= File.exist?("_swarm_cache.json") ? JSON.parse(File.read("_swarm_cache.json")) : {}
    return @swarm_cache
  end

  def add_to_swarm_cache(location_id, body)
    puts "storing in swarm cache #{location_id}"
    s = swarm_cache
    s[location_id] = body
    File.write("_swarm_cache.json", JSON.pretty_generate(s))
    return s
  end

  def fetch_checkin_detail(checkin)
    location_id = checkin["venue"].fetch("id")
    details = swarm_cache[location_id]
    if details.nil?
      url = "https://api.foursquare.com/v2/checkins/#{checkin['id']}?oauth_token=#{ENV['FOURSQUARE_SESSION']}&v=20210506"
      r = Excon.get(url)
      details = JSON.parse(r.body)
      add_to_swarm_cache(location_id, details)
      sleep(2.5 + rand * 2)
    else
      puts "loaded from swarm cache #{location_id}"
    end
    return details
  end

  def generate(co)
    csv = ["Timestamp;swarmCurrent#{co.capitalize}"]
    
    all = []
    checkins.each do |checkin|
      parsed_time = Time.at(checkin["createdAt"])
      parsed_date = Date.parse(parsed_time.strftime('%Y/%m/%d'))
      d = fetch_checkin_detail(checkin)
      l = d["response"]["checkin"]["venue"]["location"]
      all << [
        l.fetch("lat"),
        l.fetch("lng")
      ]
      puts d["response"]["checkin"]["venue"]["name"]
      
      value_to_include_in_csv = if co == "latitudeLongitude"
        [l.fetch("lat"), l.fetch("lng")].join(',')
      elsif co == "latitude"
        l.fetch("lat")
      elsif co == "longitude"
        l.fetch("lng")
      else
        raise "error #{co}"
      end
      csv << "#{parsed_time.to_i};#{value_to_include_in_csv}"
      break if all.count > 100
    end
    File.write("tracks.json", JSON.pretty_generate(all))    
    File.write("swarm_current_#{co}.csv", csv.join("\n"))
  end
end

s = SwarmCoordinates.new
s.generate("latitudeLongitude")
s.generate("latitude")
s.generate("longitude")
