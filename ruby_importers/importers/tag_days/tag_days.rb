require_relative "../importer"

module Importers
  class TagDays < Importer
    def import
      puts "Starting tagging days..."
      raw_data.each do |row|
        next if row[:key].start_with?("swarm") # those are always already tagged during import
        next if row[:key] == "mood" # TODO: this will be separate

        timestamp_to_use = row[:timestamp] / 1000.0
        timestamp_date = Time.at(timestamp_to_use)

        # Go down from e.g. 2:34am to 23:59, which is the date this entry is for
        while timestamp_date.hour < 21
          timestamp_to_use -= 60
          timestamp_date = Time.at(timestamp_to_use)
        end

        all_dates[row[:key]] ||= {}
        all_dates[row[:key]][timestamp_date.to_date] ||= []
        all_dates[row[:key]][timestamp_date.to_date] << row
      end

      # Verify we have at least one entry for every date
      # We still have the assumption, that we track alcoholIntake for every day
      key_to_use_to_verify = "alcoholIntake"
      current_date = all_dates[key_to_use_to_verify].keys.min
      
      dates_with_missing_data = []
      dates_with_duplicate_data = []
      
      while current_date < all_dates[key_to_use_to_verify].keys.max
        current_date += 1
        
        matched = Array(all_dates[key_to_use_to_verify][current_date])
        if matched.count == 0
          dates_with_missing_data << current_date
        elsif matched.count > 1
          dates_with_duplicate_data << current_date
        end
      end

      # On 2021-11-03 we have a total of 21 dates_with_missing_data.count and 3 dates_with_duplicate_data.count
      # I verified that those dates were messy around time zones, and did not come from any miscalculated dates
      # In 2021 there were a total of 5 missed dates, and in 2020 only 3
      if dates_with_missing_data.count > 21 || dates_with_duplicate_data.count > 3
        # Missing:
        # => [#<Date: 2019-05-29 ((2458633j,0s,0n),+0s,2299161j)>,
        #   #<Date: 2019-06-07 ((2458642j,0s,0n),+0s,2299161j)>,
        #   #<Date: 2019-06-08 ((2458643j,0s,0n),+0s,2299161j)>,
        #   #<Date: 2019-06-09 ((2458644j,0s,0n),+0s,2299161j)>,
        #   #<Date: 2019-06-10 ((2458645j,0s,0n),+0s,2299161j)>,
        #   #<Date: 2019-06-11 ((2458646j,0s,0n),+0s,2299161j)>,
        #   #<Date: 2019-06-13 ((2458648j,0s,0n),+0s,2299161j)>,
        #   #<Date: 2019-06-15 ((2458650j,0s,0n),+0s,2299161j)>,
        #   #<Date: 2019-07-26 ((2458691j,0s,0n),+0s,2299161j)>,
        #   #<Date: 2019-08-02 ((2458698j,0s,0n),+0s,2299161j)>,
        #   #<Date: 2019-08-31 ((2458727j,0s,0n),+0s,2299161j)>,
        #   #<Date: 2019-10-11 ((2458768j,0s,0n),+0s,2299161j)>,
        #   #<Date: 2019-10-12 ((2458769j,0s,0n),+0s,2299161j)>,
        #   #<Date: 2020-03-14 ((2458923j,0s,0n),+0s,2299161j)>,
        #   #<Date: 2020-07-10 ((2459041j,0s,0n),+0s,2299161j)>,
        #   #<Date: 2020-12-05 ((2459189j,0s,0n),+0s,2299161j)>,
        #   #<Date: 2021-03-06 ((2459280j,0s,0n),+0s,2299161j)>,
        #   #<Date: 2021-06-28 ((2459394j,0s,0n),+0s,2299161j)>,
        #   #<Date: 2021-06-29 ((2459395j,0s,0n),+0s,2299161j)>,
        #   #<Date: 2021-06-30 ((2459396j,0s,0n),+0s,2299161j)>,
        #   #<Date: 2021-11-03 ((2459522j,0s,0n),+0s,2299161j)>]
        #
        # Duplicates:
        # => [#<Date: 2019-06-16 ((2458651j,0s,0n),+0s,2299161j)>, #<Date: 2020-12-06 ((2459190j,0s,0n),+0s,2299161j)>, #<Date: 2021-06-27 ((2459393j,0s,0n),+0s,2299161j)>]
        require 'pry'; binding.pry
        raise "Verify the above"
      end

      # Now, update all the entries
      all_dates.each do |key, key_values|
        key_values.each do |date, matched_rows|
          matched_rows.each do |row|
            if row[:matcheddate].nil?
              # Insert the day of the week for this specific entry
              insert_row_for_timestamp(
                timestamp: Time.at(row[:timestamp] / 1000),
                key: "dateDayOfTheWeek",
                value: Date::DAYNAMES[date.wday],
                question: "Day of the week",
                type: "text",
                import_id: import_id,
                matched_date: date,
                source: "tag_days"
              )

              # Insert the month of the year for this specific entry
              insert_row_for_timestamp(
                timestamp: Time.at(row[:timestamp] / 1000),
                key: "dateMonthOfTheYear",
                value: date.strftime("%B"),
                question: "Month of the year",
                type: "text",
                import_id: import_id,
                matched_date: date,
                source: "tag_days"
              )
              
              puts "updated date entry for key #{row[:key]} to use #{date}..."
              raw_data.where(id: row[:id]).update(matcheddate: date)
            elsif row[:matcheddate] != date
              raise "Something seems off here: #{row[:matcheddate]} != #{date}"
            end
          end
        end
      end
    end

    def all_dates
      @_all_dates ||= {}
    end

    def import_id
      @_import_id ||= SecureRandom.hex
    end
  end
end

if __FILE__ == $0
  # Run using
  #
  #   be ruby importers/tag_days/tag_days.rb
  # 
  Importers::TagDays.new.import
end
