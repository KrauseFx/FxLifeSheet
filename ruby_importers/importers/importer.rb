require 'pry'
require 'pg'
require 'sequel'
require 'date'

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
        matching_entries = matching_entries.to_a.sort_by { |v| (v[:timestamp] - timestamp).abs }.reverse
        # First one is the closer one here
      elsif matching_entries.count == 0
        # fallback to other keys (e.g. data before we tracked alcohol etc)
        fallback_entries = raw_data.where(timestamp: (timestamp - buffer_in_ticks / 2.0)..(timestamp + buffer_in_ticks / 2.0))
        fallback_entries = raw_data.where(timestamp: (timestamp - buffer_in_ticks * 2)..(timestamp + buffer_in_ticks * 2)) if fallback_entries.count == 0
        matching_entries = fallback_entries.to_a.sort_by { |v| (v[:timestamp] - timestamp).abs }.reverse
        if matching_entries.count == 0
          puts "none found, this is okay #{date}"
          return nil
        end
      end

      return matching_entries.first
    end

    def insert_row(date:, key:, type:, value:, question:)
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
        raw_data.insert(new_entry)
        puts "--- Successfully backfilled entry for #{key} to #{value} on #{new_entry[:yearmonth]}-#{new_entry[:day]}"
      else
        require 'pry'; binding.pry
      end
    end
  end
end
