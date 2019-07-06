require 'json'

checkins = JSON.parse(File.read("checkins.json"))

airports = checkins["items"].keep_if do |checkin|
  v_name = checkin["venue"]["name"].downcase
  matched = v_name.downcase.include?("airport")
  regex_matched = v_name =~ /\([A-Z]{3}\)/

  (regex_matched || matched) && !v_name.include?("railway") && !v_name.include?("austria center") && !v_name.include?("bahnhof")
end
puts airports.collect { |a| a["venue"]["name"]}.uniq.join("\n")

csv = "Date;airport"
airports.each do |airport|
  csv += "\n#{Time.at(airport["createdAt"]).strftime("%d.%m.%Y")};1"
end

puts csv

puts airports.count

File.write("airports.csv", csv)
