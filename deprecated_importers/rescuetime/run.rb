require 'csv'
require 'date'

file = "rescuetime-activity-history.csv"

puts "starting to parse #{file}, this might take a while"

data = CSV.read(file) # this has `1,137,918` rows in my case
final_data = {}

data.each do |row|
  # => ["2013-08-22 00:00:00 -0700", "adium", "No Details", "Communication & Scheduling", "Instant Message", "222"]
  date = Date.parse(row[0])
  minutes = row[5]

  final_data[date] ||= 0
  final_data[date] += minutes.to_i
end

csv = "Date;dailyComputerUse"

final_data.each do |date, value|
  csv << "\n#{date.strftime("%d.%m.%Y")};#{(value / 60.0).round}"
end

puts csv

File.write("computer_usage.csv", csv)
