# Apple Health

No long term strategy yet, but

Manually remove the header, export as daily, and use sublime to get rid of the overhead

Make sure to use the left (start) date, not the end-date. So the data should look like this. Also get rid of the time

```
02-Jan-2017;96.0
03-Jan-2017;7597.0
04-Jan-2017;7731.0
05-Jan-2017;2508.0
06-Jan-2017;13996.0
07-Jan-2017;4484.0
08-Jan-2017;8882.0
09-Jan-2017;5106.0
10-Jan-2017;2490.0
11-Jan-2017;8593.0
```

Code to run in `pry` or `irb`

```
steps = File.read("/Users/felixkrause/Downloads/Health\ Data.csv")

csv = "Date;[HEADER]\n"

data = steps.split("\n").collect do |l| 
  next if l.split(",").last.to_i == 0
  Date.strptime(l.split(",")[0], "%d-%b-%Y").strftime("%d.%m.%Y") + ";" + l.split(",").last.to_i.to_s
end.compact
csv += data.join("\n")

File.write("weight-exported.csv", csv)
```

Export Apple Health data using the QS Acecss app
