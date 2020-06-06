require 'json'

checkins = JSON.parse(File.read("checkins.json"))

start_date = Time.at(1553385600000 / 1000)

airports = checkins["items"].keep_if do |checkin|
  if checkin["venue"].nil? || checkin["venue"]["name"].nil?
    # I got one of these, maybe it's an offline checkin
    #   => {"id"=>"5ab798546fa81f002b1a1acf",
    #    "createdAt"=>1521981524,
    #    "type"=>"checkin",
    #    "timeZoneOffset"=>480,
    #    "comments"=>{"count"=>0}}
    false
  else
    v_name = checkin["venue"]["name"].downcase
    matched = v_name.downcase.include?("airport")
    regex_matched = v_name =~ /\([A-Z]{3}\)/

    (regex_matched || matched) && !v_name.include?("railway") && !v_name.include?("austria center") && !v_name.include?("bahnhof")
  end
end
# puts airports.collect { |a| a["venue"]["name"]}.uniq.join("\n")

csv = "Date;airport"
airports.each do |airport|
  parsed_time = Time.at(airport["createdAt"])
  next if (parsed_time - start_date) < 24 * 60 * 60
  puts "#{parsed_time - start_date}"
  csv += "\n#{parsed_time.strftime("%d.%m.%Y")};1"
end

puts csv

puts "Total over all time #{airports.count}"
puts "Total since #{start_date}: #{csv.split("\n").count - 1}"

File.write("airports.csv", csv)
