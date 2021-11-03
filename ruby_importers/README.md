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

**Tag the days**

```
be ruby importers/tag_days/tag_days.rb
```
