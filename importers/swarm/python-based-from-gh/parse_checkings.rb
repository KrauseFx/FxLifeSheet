require "json"
require "date"
require "pry"

checkins = JSON.parse(File.read("checkin_details.json"))
puts "Found #{checkins.count} checkins"

number_of_checkins = {}
checkins.reverse.each do |checkin| # reverse is important to start with the oldest checkins
    date = DateTime.parse(checkin["created"]).to_date
    number_of_checkins[date] ||= {}

    # numberOfSwarmCheckins
    number_of_checkins[date]["numberOfSwarmCheckins"] ||= 0
    number_of_checkins[date]["numberOfSwarmCheckins"] += 1

    # We assign here and override, since it's sorted by date/time, so it will use the last one
    # this will not be super precise on days of flying I guess, but that's a blur anyway
    number_of_checkins[date]["swarmLocationCity"] = checkin["city"] if checkin["city"].to_s.length > 0
    number_of_checkins[date]["swarmLocationState"] = checkin["state"] if checkin["state"].to_s.length > 0
    number_of_checkins[date]["swarmLocationCountry"] = checkin["country"] if checkin["country"].to_s.length > 0
    number_of_checkins[date]["swarmLocationLatitude"] = checkin["latitude"] if checkin["latitude"].to_s.length > 0
    number_of_checkins[date]["swarmLocationLongitude"] = checkin["longitude"] if checkin["longitude"].to_s.length > 0

    # Categories
    number_of_checkins[date]["swarmAirportCheckin"] ||= 1 if checkin["venue_categories"].downcase.include?("airport")
    number_of_checkins[date]["swarmBarberCheckin"] ||= 1 if checkin["venue_categories"].downcase.include?("barber")
    number_of_checkins[date]["swarmTransitCheckin"] ||= 1 if (checkin["venue_categories"].downcase.include?("train") || checkin["venue_categories"].downcase.include?("metro"))
    number_of_checkins[date]["swarmNightlifeCheckin"] ||= 1 if (checkin["venue_categories"].downcase.include?("nightclub") || checkin["venue_categories"].downcase.include?("speakeasy") || checkin["venue_categories"].downcase.include?("bar"))
end

headers = number_of_checkins.collect { |_, values| values.keys }.flatten.uniq

output_content = [(["Date"] + headers).join(";")]
output_content += number_of_checkins.collect do |date, values|
    # TODO: use the importer I wrote, as this won't consider the right time
    # And the importer source
    ([date.strftime("%d.%m.%Y")] + headers.collect do |current_header|
        values[current_header]
    end).join(";")
end

File.write("all_swarm.csv", output_content.join("\n"))
