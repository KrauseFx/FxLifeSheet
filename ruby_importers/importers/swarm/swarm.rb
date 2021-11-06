require 'excon'

class Swarm
  def checkins
    @checkins ||= JSON.parse(File.read("checkins.json"))["items"]
  end

  def fetch_checkin_detail(checkin)
    return nil if checkin["venue"].nil? # I guess those are the check-ins where the venue got deleted

    location_id = checkin["venue"].fetch("id")
    details = swarm_cache[location_id]
    raise "No foursquare auth" unless ENV['FOURSQUARE_SESSION'].to_s.length > 0
    if details.nil?
      url = "https://api.foursquare.com/v2/checkins/#{checkin['id']}?oauth_token=#{ENV['FOURSQUARE_SESSION']}&v=20210506"
      r = Excon.get(url)
      details = JSON.parse(r.body)
      raise "Foursquare request has failed" if details["meta"].fetch("code") != 200
      add_to_swarm_cache(location_id, details)
      sleep(4.5 + rand * 10)
    else
      puts "loaded from swarm cache #{location_id}"
    end
    return details
  end

  private
  def add_to_swarm_cache(location_id, body)
    puts "storing in swarm cache #{location_id}"
    s = swarm_cache
    s[location_id] = body
    File.write("_swarm_cache.json", JSON.pretty_generate(s))
    return s
  end

  def swarm_cache
    @swarm_cache ||= File.exist?("_swarm_cache.json") ? JSON.parse(File.read("_swarm_cache.json")) : {}
    return @swarm_cache
  end
end

