# Importers (Ruby based - New)

```
source ../.keys
```

## Use latest data from Heroku

```
ruby ../clone_heroku_db.rb
```

## Run the scripts below in the right order:

### Step 1: Tag the days

```
be ruby importers/tag_days/tag_days.rb
```

This will also backfill the day of the week and the month of the year

### Step 2: Import historic location based on Swarm & Telegram

```
be ruby importers/swarm/swarm_coordinates_importer.rb
```

### Step 3: Fetch historic weather data

```
be ruby importers/weather/backfill_weather.rb
```

## Unordered scripts you can run at any time after tagging the days

### Apple Health: Steps

1. Export Apple Health data using the QS Acecss app
1. Choose `1 Day` & `Steps`
1. `Create Table`
1. Airdrop to Mac
1. Store resulting file in `./importers/apple_health` folder named `Health Data.csv`

```
be ruby importers/apple_health/apple_health.rb
```

### Instapipe

Set `INSTAPIPE_DATABASE_URL` from `.keys` and run

```
be ruby importers/instapipe/instapipe.rb
```

### RescueTime

1. Copy the latest archive from [https://www.rescuetime.com/accounts/your-data](https://www.rescuetime.com/accounts/your-data) to `./importers/rescuetime`, unzipped (the `rescuetime-activity-history.csv` file)

```
be ruby importers/rescuetime/rescuetime.rb
```

### Location Info

This also has to happen after the other scripts, this will download and store the address information based on the lat/lng values, including the city, country & continent.

```
be ruby importers/location_info/location_info.rb
```
