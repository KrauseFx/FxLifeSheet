require 'pry'
require 'pg'
require 'sequel'
require 'date'
require 'securerandom'

module Importers
  class Importer
    def database
      @_db ||= Sequel.connect(ENV.fetch("DATABASE_URL"))
      if !@checked && @_db[:raw_data].exclude(key: "mood").where(matcheddate: nil).count > 0
        puts "Be careful, we got at least 1 entry where matched_date isn't tagged, press enter to ignore"
        gets
        @checked = true
      end
      @_db
    end

    def raw_data
      database[:raw_data]
    end

    def find_closest_row_for_date(date:)
      timestamp = (date + 1).strftime("%Q").to_i # since we fill out data at ~midnight (end of day)

      # Find the nearest evening question (using alcohol since I'll always be tracking that)
      buffer_in_ticks = 120000000

      # First, prefer the already-tagged one
      matching_entries = raw_data.where(key: "alcoholIntake").where(matcheddate: date)
      return matching_entries.first if matching_entries.count == 1

      matching_entries = raw_data.where(
        key: "alcoholIntake", 
        timestamp: (timestamp - buffer_in_ticks / 2.0)..(timestamp + buffer_in_ticks / 2.0),
      )
      return matching_entries.first if matching_entries.count == 1

      if matching_entries.count > 1
        # First one is the closer one here
        return matching_entries.to_a.sort_by { |v| (v[:timestamp] - timestamp).abs }.first
      elsif matching_entries.count == 0
        # fallback to other keys (e.g. data before we tracked alcohol etc), except for mood since we don't have matchedDate for those entries
        to_exclude = ["add_time_range", "importer_swarm", "backfill_weather"]
        fallback_entries = raw_data.where(timestamp: (timestamp - buffer_in_ticks / 2.0)..(timestamp + buffer_in_ticks / 2.0)).to_a.find_all { |a| !to_exclude.include?(a[:source]) }
        fallback_entries = raw_data.where(timestamp: (timestamp - buffer_in_ticks * 2)..(timestamp + buffer_in_ticks * 2)).to_a.find_all { |a| !to_exclude.include?(a[:source]) } if fallback_entries.count == 0
        matching_entries = fallback_entries.to_a.sort_by { |v| (v[:timestamp] - timestamp).abs }
        if matching_entries.count == 0
          puts "none found, this is okay #{date}"
          return nil
        end
        return matching_entries.first
      end
    end

    # You have to provide either a `date` or a `timestamp`
    # if you provide a `date`, we will look for the closed `alcoholIntake` entry, and use the same timestamp
    # if you provide a `timestamp`, we will use that exact time stamp

    def insert_row_for_date(date:, key:, type:, value:, question: nil, source:, import_id:)
      raise "invalid type #{type}" unless ["boolean", "range", "number", "text"].include?(type)

      # First, look if we have an existing row from a previous import
      existing_entries = raw_data.where(
        matcheddate: date,
        key: key,
      )
      if existing_entries.count == 1
        existing_entry = existing_entries.first
        if existing_entry[:source] == source && existing_entry[:value].to_s == value.to_s # to_s to work with nil, and numbers also
          puts "#{date} #{key} Verified existing entry from import_id #{existing_entry[:importid]} is valid & matching..."
        elsif existing_entry[:source] == source
          # TODO: This means the value has changed, it will be fine to just update the entry probably
          binding.pry
        else
          # Different source/value
          binding.pry
        end
      elsif existing_entries.count > 1
        binding.pry # TODO: how to handle
      else
        puts "Looking for match on #{date}..."
        if matching_entry = find_closest_row_for_date(date: date)
          puts "Found match: #{date}\t\t#{matching_entry[:month]}-#{matching_entry[:day]} #{matching_entry[:hour]}:#{matching_entry[:minute]}"

          new_entry = matching_entry.dup
          # if new_entry[:matcheddate] != date
          #   binding.pry
          # end
          
          new_entry.delete(:id)
          new_entry[:key] = key
          new_entry[:question] = question
          new_entry[:type] = type
          new_entry[:value] = value
          new_entry[:source] = source
          new_entry[:importedat] = DateTime.now
          new_entry[:importid] = import_id

          raw_data.insert(new_entry)
          puts "--- Successfully backfilled entry for #{key} to #{value} on #{new_entry[:yearmonth]}-#{new_entry[:day]}"
        else
          puts "Couldn't find an entry for that day, but that's okay if we can't backfill, since all other data is basically missing for that day also"
        end
      end
    end

    # e.g. precise Swarm check-in time
    # or for backfilling the day of the week or month of the year
    def insert_row_for_timestamp(timestamp:, key:, type:, value:, question: nil, source:, import_id:, matched_date:)
      raise "invalid type #{type}" unless ["boolean", "range", "number", "text"].include?(type)

      new_entry = generate_timestamp_details_based_on_timestamp(timestamp)
      existing_entries = raw_data.where(
        timestamp: timestamp.to_i * 1000,
        matcheddate: matched_date,
        key: key,
      )

      if existing_entries.count == 1
        existing_entry = existing_entries.first
        if existing_entry[:source] == source && existing_entry[:value].to_s == value.to_s # to_s to work with nil, and numbers also
          puts "#{matched_date} #{key} Verified existing entry from import_id #{existing_entry[:importid]} is valid & matching..."
        else
          # TODO: This means the value has changed, it will be fine to just update the entry probably
          binding.pry
        end
      elsif existing_entries.count > 1
        binding.pry # TODO: how to handle
      else
        new_entry[:key] = key
        new_entry[:question] = question
        new_entry[:type] = type
        new_entry[:value] = value
        new_entry[:source] = source
        new_entry[:importedat] = DateTime.now
        new_entry[:importid] = import_id
        new_entry[:matcheddate] = matched_date
        raw_data.insert(new_entry)
        puts "--- Successfully backfilled entry for #{key} to #{value} on #{new_entry[:yearmonth]}-#{new_entry[:day]}"
      end
    end

    def generate_timestamp_details_based_on_timestamp(timestamp)
      {
        timestamp: timestamp.to_i * 1000,
        yearmonth: timestamp.strftime("%Y%m"),
        yearweek: timestamp.strftime("%Y%W"),
        year: timestamp.strftime("%Y"),
        quarter: (timestamp.month / 3.0).ceil, # via https://stackoverflow.com/questions/8414767/ruby-method-to-get-the-months-of-quarters-a-given-date-belongs-to
        month: timestamp.strftime("%-m"),
        day: timestamp.strftime("%-d"),
        hour: timestamp.strftime("%k").gsub(" ", ""),
        minute: timestamp.strftime("%-M"),
        week: timestamp.strftime("%-W")
      }
    end

    # pass in either a key, or a custom `existing_entries` filter
    # This will only be used if you change the whole system of how something is being imported
    # because otherwise we want to be smart and not replace all the data each time
    def clear_prior_rows(key: nil, existing_entries: nil)
      # TODO: store a reference to those, and delete only after the new ones were imported successfully
      # And support multiple per run
      raise "No data provided" if key.nil? && existing_entries.nil?
      existing_entries ||= raw_data.where(key: key)

      if existing_entries.count > 0
        puts "Using database #{ENV['DATABASE_URL'][0...30]}..."
        puts "Already #{existing_entries.count} entries for #{key}, are you sure you want to replace all of those entries? (y/n)"
        raise "user cancelled" unless gets.strip == 'y'
        existing_entries.delete
        puts "Deleted..."
      end
    end
  end
end
