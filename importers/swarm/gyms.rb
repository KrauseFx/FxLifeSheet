require 'json'

checkins = JSON.parse(File.read("checkins.json"))

gyms = checkins["items"].keep_if do |checkin|
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
    matched = v_name.downcase.include?("sports centre")
  end
end
puts gyms.collect { |a| a["venue"]["name"]}.uniq.join("\n")

csv = "Date;airport"
gyms.each do |airport|
  parsed_time = Time.at(airport["createdAt"])
  csv += "\n#{parsed_time.strftime("%d.%m.%Y")};1"
end

puts csv

puts "Total over all time #{gyms.count}"
puts "Total since #{start_date}: #{csv.split("\n").count - 1}"

File.write("gyms.csv", csv)
