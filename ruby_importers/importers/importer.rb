require 'pry'
require 'pg'
require 'sequel'
require 'date'
require 'securerandom'

module Importers
  class Importer
    def database
      @_db ||= Sequel.connect(ENV.fetch("DATABASE_URL"))
    end

    def raw_data
      database[:raw_data]
    end

    def find_closest_row_for_date(date:)
      timestamp = (date + 1).strftime("%Q").to_i # since we fill out data at ~midnight (end of day)

      # Find the nearest evening question (using alcohol since I'll always be tracking that)
      buffer_in_ticks = 120000000
                          
      matching_entries = raw_data.where(
        key: "alcoholIntake", 
        timestamp: (timestamp - buffer_in_ticks / 2.0)..(timestamp + buffer_in_ticks / 2.0)
      )

      if matching_entries.count > 1
        matching_entries = matching_entries.to_a.sort_by { |v| (v[:timestamp] - timestamp).abs }
        # First one is the closer one here
      elsif matching_entries.count == 0
        # fallback to other keys (e.g. data before we tracked alcohol etc), except for mood since we don't have matchedDate for those entries
        fallback_entries = raw_data.exclude(key: "mood").where(timestamp: (timestamp - buffer_in_ticks / 2.0)..(timestamp + buffer_in_ticks / 2.0))
        fallback_entries = raw_data.exclude(key: "mood").where(timestamp: (timestamp - buffer_in_ticks * 2)..(timestamp + buffer_in_ticks * 2)) if fallback_entries.count == 0
        matching_entries = fallback_entries.to_a.sort_by { |v| (v[:timestamp] - timestamp).abs }.reverse
        if matching_entries.count == 0
          puts "none found, this is okay #{date}"
          return nil
        end
      end

      return matching_entries.first
    end

    # You have to provide either a `date` or a `timestamp`
    # if you provide a `date`, we will look for the closed `alcoholIntake` entry, and use the same timestamp
    # if you provide a `timestamp`, we will use that exact time stamp

    def insert_row_for_date(date:, key:, type:, value:, question:, source:, import_id:)
      raise "invalid type #{type}" unless ["boolean", "range", "number", "text"].include?(type)
      
      puts "Looking for match on #{date}..."
      if matching_entry = find_closest_row_for_date(date: date)
        puts "Found match: #{date}\t\t#{matching_entry[:month]}-#{matching_entry[:day]} #{matching_entry[:hour]}:#{matching_entry[:minute]}"
        
        new_entry = matching_entry.dup
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
        require 'pry'; binding.pry
      end
    end

    # e.g. precise Swarm check-in time
    def insert_row_for_timestamp(timestamp:, key:, type:, value:, question:, source:, import_id:, matched_date:)
      raise "invalid type #{type}" unless ["boolean", "range", "number", "text"].include?(type)
        
      new_entry = generate_timestamp_details_based_on_timestamp(timestamp)
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
