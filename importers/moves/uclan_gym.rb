require 'json'
require 'date'

csv = "Date;gym"
all_files = Dir["daily/places/*"]

# Get all steps
puts "parsing #{all_files.count} days of data"
all_files.each do |file|
  day = JSON.parse(File.read(file))
  
  date = file.match(/places\_(\d+)\./)[1]
  parsed_date = Date.strptime(date, "%Y%m%d")

  day["features"].each do |feature|
    place = feature["properties"]["place"]
    if place["name"].to_s.include?("Sports Centre")
      csv << "\n#{parsed_date.strftime("%d.%m.%Y")};1"
    end
  end
end

puts csv
File.write("gym.csv", csv)

puts "Finished #{all_files.count} days, #{csv.split("\n").count - 1} entries"

