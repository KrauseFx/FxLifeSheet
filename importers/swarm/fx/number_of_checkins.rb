require 'json'
require 'date'
require 'pry'

checkins = JSON.parse(File.read("checkins.json"))["items"]

csv = "Date;numberOfSwarmCheckins"

dates = {}
checkins.each do |checkin|
  parsed_time = Time.at(checkin["createdAt"])
  parsed_date = Date.parse(parsed_time.strftime('%Y/%m/%d'))

  dates[parsed_date] ||= 0
  dates[parsed_date] += 1
end

dates.each do |parsed_date, count|
    csv += "\n#{parsed_date.strftime("%d.%m.%Y")};#{count}"
end

puts csv

File.write("number_of_checkins.csv", csv)
