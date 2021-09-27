require_relative "../importer"

module Importers
  class TagDays < Importer
    def import
      # TODO: add .where(matcheddate: nil)
      raw_data.each do |row|
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

      all_dates.each do |key, key_values|
        key_values.each do |date, matched_rows|
          matched_rows.each do |row|
            if row[:matcheddate].nil?
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
  end
end

if __FILE__ == $0
  # Run using
  #
  #   be ruby importers/tag_days/tag_days.rb
  # 
  Importers::TagDays.new.import
end
