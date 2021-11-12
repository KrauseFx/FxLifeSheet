# Google-Sheets-DB

This folder contains all the necessary scripts to migrate from the Google Sheets as datasource over to an actual database, in this case being Postgres.

Download as `.tsv`, as Postgres can't properly handle CSV file imports.

To remove the trailing columns, run the following in `pry`

```ruby
path = "LifeFxSheetRawData.tsv"
content = File.read(path)
content.gsub!("\t\r\n", "\r\n")
File.write(path, content)
```

and then import using

```sql
COPY raw_data (
  Timestamp,
  YearMonth,
  YearWeek,
  Year,
  Quarter,
  Month,
  Week,
  Day,
  Hour,
  Minute,
  Key,
  Question,
  Type,
  Value
)

FROM '/Users/felixkrause/Developer/fxlifesheet/importers/google-sheets-db/LifeFxSheetRawData.tsv' DELIMITER E'\t' CSV HEADER;
```

And since Heroku doesn't support importing DBs without some weird custom things, you gotta import all of this locally, and then run

```
pg_dump -Fc --no-acl --no-owner -h localhost -U felixkrause fxlifesheet > mydb.dump
```

## Import Heroku dump to local Postgres

```
pg_restore --verbose --clean --no-acl --no-owner -h localhost -U felixkrause -d fxlifesheet latest.dump
```

postgresql://felixkrause@localhost/instapipe
