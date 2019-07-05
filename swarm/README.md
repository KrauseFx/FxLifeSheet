# Swarm

Some importers that I can run periodically to get some extra information.

e.g. did I fly a given day (based on if I was at an airport)

## Use

1. Request a new archive via the Swarm mobile app (this might take a while)
1. Copy the latest `checkins.json` into this folder
1. `bundle install`
1. `bundle exec ruby airports.rb`
1. Drag & drop `airports.csv` into FxLifeSheet
