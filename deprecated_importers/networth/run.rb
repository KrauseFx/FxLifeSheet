require 'csv'

csv = "Date;networthUSD"
CSV.read("finances.csv", headers: true).each do |row|
  next unless row[0]
  next unless row["Sum real"]

  sum = row["Sum real"].gsub("$", "").gsub(".", "").to_i
  parsed_time = Date.parse(row[0])

  csv += "\n#{parsed_time.strftime("%d.%m.%Y")};#{sum}"
end

puts csv

File.write("NetWorth.csv", csv)
