require_relative '../importer'
require "json"
require "rspotify"

module Importers
  class Spotify < Importer
    def import
      songs_per_day = {}
      duration_per_day = {}
      skipped_songs = {}
      finished_songs = {}
      unique_songs = {}

      end_songs.each do |song|
        date = DateTime.parse(song["ts"]).to_date
        songs_per_day[date] ||= 0
        duration_per_day[date] ||= 0
        skipped_songs[date] ||= 0
        finished_songs[date] ||= 0

        songs_per_day[date] += 1
        duration_per_day[date] += (song["ms_played"] / 1000.0)
        skipped_songs[date] += 1 if song["skipped"]
        finished_songs[date] += 1 if song["reason_end"] == "trackdone"

        if song["spotify_track_uri"]
          unique_songs[song["spotify_track_uri"]] ||= 0
          unique_songs[song["spotify_track_uri"]] += 1
        end
      end

      binding.pry

      songs_per_day.each do |date, count|
        all_threads << Thread.new do
          insert_row_for_date(
            key: "spotify_songs_per_day", 
            value: count,
            date: date, 
            type: "number",
            source: "spotify", 
            import_id: import_id
          )
          insert_row_for_date(
            key: "spotify_duration_per_day", 
            value: duration_per_day[date],
            date: date, 
            type: "number",
            source: "spotify", 
            import_id: import_id
          )
          insert_row_for_date(
            key: "spotify_skip_ratio_per_day", 
            value: skipped_songs[date] / count.to_f,
            date: date, 
            type: "number",
            source: "spotify", 
            import_id: import_id
          )
          insert_row_for_date(
            key: "spotify_finish_ratio_per_day", 
            value: finished_songs[date] / count.to_f,
            date: date, 
            type: "number",
            source: "spotify", 
            import_id: import_id
          )
        end
        wait_for_threads
      end

      oldest_songs = []
      end_songs.sort_by { |song| song["ts"] }.each do |song|
        next unless song["spotify_track_uri"].to_s.length > 0
        oldest_songs << song unless oldest_songs.find { |a| a["spotify_track_uri"] == song["spotify_track_uri"] }
        break if oldest_songs.count > 500
      end

      # Create the 2 playlists
      create_spotify_playlist(oldest_songs.collect do |song|
        song["spotify_track_uri"]
      end, "First 500 Spotify songs")

      unique_songs = unique_songs.sort_by { |_, v| v }.reverse
      create_spotify_playlist(unique_songs[0, 500].collect { |k, _| k }, "Top 500 Songs All-Time")
    end

    def create_spotify_playlist(songs, playlist_name)
      raise "need 500 items" unless songs.count == 500
      RSpotify::authenticate(ENV.fetch("SPOTIFY_CLIENT_ID"), ENV.fetch("SPOTIFY_CLIENT_SECRET"))

      # Session tokens taken from Jukebox for Sonos project (database)
      # {
      #   "credentials": {
      #     "access_token": "..-..",
      #     "token_type": "Bearer",
      #     "expires_in": 3600,
      #     "refresh_token": "..-..",
      #     "scope": "playlist-read-private user-library-modify playlist-modify-public",
      #     "token": "..-U.."
      #   },
      #   "info": {
      #     "display_name": "Felix Krause",
      #     "external_urls": {
      #       "spotify": "https://open.spotify.com/user/."
      #     },
      #     "followers": {
      #       "href": null,
      #       "total": 118
      #     },
      #     "href": "https://api.spotify.com/v1/users/.",
      #     "id": ".",
      #     "images": [
      #       {
      #         "height": null,
      #         "url": "https://scontent-lcy1-2.xx.fbcdn.net/v/t39=c220.71.818.818a_dst-jpg_s320x320&_nc_cat=101&ccb=1-6&_nc_sid=0c64ff&_nc_ohc=eRyRUKR2vbkAX_A9VEi&_nc_ht=scontent-lcy1-2.xx&edm=AP4hL3IEAAAA&oh=&oe=627A4E1E",
      #         "width": null
      #       }
      #     ],
      #     "type": "user",
      #     "uri": "spotify:user:."
      #   }
      # }

      puts "Creating playlist..."
      spotify_user = RSpotify::User.new(JSON.parse(ENV.fetch("SPOTIFY_USER_INFO")))
      playlist = spotify_user.create_playlist!(playlist_name)
      5.times do |i|
        puts "Adding songs #{i * 100} - #{(i + 1) * 100}..."
        playlist.add_tracks!(songs[i * 100, 100])
        sleep(3)
      end

      puts "Successfully created playlist"
    end

    def end_songs
      return @_end_songs if @_end_songs

      @_end_songs = []
      Dir[File.join("importers", "spotify", "full-archive", "endsong_*.json")].each do |file|
        @_end_songs += JSON.parse(File.read(file))
      end
      return @_end_songs
    end

    def wait_for_threads
      puts "#{all_threads.count} threads running"
      return if all_threads.count < 6
      puts "Waiting for #{all_threads.count} threads to finish"
      all_threads.each(&:join)
      @all_threads = []
    end

    def all_threads
      @all_threads ||= []
    end

    def import_id
      @_import_id ||= SecureRandom.hex
    end
  end
  
  if __FILE__ == $0
    Importers::Spotify.new.import
  end
end
