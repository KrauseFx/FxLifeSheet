Using https://github.com/dogsheep/swarm-to-sqlite

Run the one above, it's not reliable and I was running into some issues, but manually creating some extra columns fixed it. 

Then afterwards run `bundle exec ruby parse_checkings.rb` here, to generate the CSV files to use it with FxLifeSheet

This will create a file containing the

- `numberOfSwarmCheckins`
- `Lat/Lng coordinates`
- `Gym Checkins` (notice there are multiple categories)
- `Airport Checkins`
- `Barber Checkins`
- `Train Station Checkins`
- `Nightclub`

To have all the data, create a new view, and use

```sql
select
    checkins.id,
    created,
    venues.id as venue_id,
    venues.name as venue_name,
    venues.latitude as latitude,
    venues.longitude as longitude,
    venues.city as city,
    venues.country as country,
    venues.state as state,
    group_concat(categories.name) as venue_categories,
    shout,
    createdBy,
    events.name as event_name
from checkins
    join venues on checkins.venue = venues.id
    left join events on checkins.event = events.id
    join categories_venues on venues.id = categories_venues.venues_id
    join categories on categories.id = categories_venues.categories_id
group by checkins.id
order by createdAt desc
```

and export the output as a JSON and call `checkin_detail.json`
