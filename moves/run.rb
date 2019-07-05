require 'json'
require 'date'

csv = "Date;dailySteps"
all_files = Dir["daily/activities/*"]

puts "parsing #{all_files.count} days of data"
all_files.each do |file|
  day = JSON.parse(File.read(file))
  daily_total_steps = 0
  date = file.match(/activities\_(\d+)\./)[1]
  parsed_date = Date.strptime(date, "%Y%m%d")

  day["features"].each do |feature|
    feature["properties"]["activities"].each do |activity|
      steps = activity["steps"]
      next if steps.to_i == 0
      daily_total_steps += steps
    end
  end

  csv << "\n#{parsed_date.strftime("%d.%m.%Y")};#{daily_total_steps}"
end

puts csv
File.write("steps.csv", csv)

puts "Finished #{all_files.count} days"
