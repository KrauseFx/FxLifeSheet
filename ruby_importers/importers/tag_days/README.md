# Tag Days

The original data tracking doesn't support tagging the actual date, due to the nature of this project around time zones.

This is fine, however it will make it way easier to analyze and visualize the data if we have a matching to a specific date.

Running this "importer" will create the necessary database values to get them.

This script will also take care of considering the time zone I was in at a given day, and prevent duplicate entries for a given day.
