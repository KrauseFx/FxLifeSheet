# Importers (Ruby based - New)

```
source ../.keys
```

## Use latest data from Heroku

```
heroku pg:backups:download
```

```
pg_restore -c -d fxlifesheet latest.dump
```


## Run the scripts below in the right order:

### Step 1: Tag the days

```
be ruby importers/tag_days/tag_days.rb
```

### Step 2: Import historic location based on Swarm & Telegram

```
be ruby importers/swarm/swarm_coordinates_importer.rb
```

### Step 3: Fetch historic weather data

```
be ruby importers/weather/backfill_weather.rb
```

### Step 4: Apple Health

1. Export Apple Health data using the QS Acecss app
1. Choose `1 Day` & `Steps`
1. `Create Table`
1. Airdrop to Mac
1. Store resulting file in `./importers/apple_health` folder named `Health Data.csv`

```
be ruby importers/apple_health/apple_health.rb
```
