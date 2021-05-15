# Swarm

Some importers that I can run periodically to get some extra information.

e.g. did I fly a given day (based on if I was at an airport)

## Use

1. Request a new archive via the Swarm mobile app (this might take a while)
1. Copy the latest `checkins.json` into this folder
1. `bundle install`
1. Update the `start_date` in `airports.rb` to be the timestamp of the last `airport` entry
1. `bundle exec ruby airports.rb`
1. Drag & drop `airports.csv` into FxLifeSheet


## For swarm_coordinates

Manually open 

https://foursquare.com/oauth2/authenticate
    ?client_id=YOUR_CLIENT_ID
    &response_type=code
    &redirect_uri=YOUR_REGISTERED_REDIRECT_URI

Get the IDs from https://foursquare.com/developers/apps/4V4EV00ZAGGEFXO5CHCD5P3OW2M0YJVGPI3UCYW4AK0RPQ4T/settings

and then

https://foursquare.com/oauth2/access_token?client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&grant_type=authorization_code&redirect_uri=YOUR_REGISTERED_REDIRECT_URI&code=CODE

