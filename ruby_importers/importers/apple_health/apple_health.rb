require_relative '../importer'
require 'net/http'
require 'csv'

module Importers
  class AppleHealth < Importer
    def import
      apple_health_file.each do |current_date, values|
        steps = values[:steps]
        next unless steps > 0
        
        if current_date >= Date.new(2019, 9, 1)
          # We have existing data from Moves before 2019, and I assume that the
          # Moves data was more accurate. Later on, the number of steps align,
          # earlier on, the Apple Health data did NOT align with Moves, mostly
          # because it wasn't built into iOS yet, but used the Apple watch back then
          insert_row_for_date(
            key: "dailySteps", 
            value: steps, 
            date: current_date, 
            type: "number",
            question: "Number of steps",
            source: "apple_health", 
            import_id: import_id
          )
        end

        current_date += 1
      end
    end

    private
    def import_id
      @_import_id ||= SecureRandom.hex
    end

    def apple_health_file
      @apple_health_file ||= CSV.read(File.join("importers", "apple_health", "Health Data.csv"), headers: true).collect do |row|
        parsed = row["Start"].match(/(\d\d\-\w\w\w\-\d\d\d\d)/)[1]

        [
          Date.strptime(parsed, '%d-%b-%Y'),
          {
            steps: row["Steps (count)"].to_i
          }
        ]
      end.to_h
    end
  end
end

if __FILE__ == $0
  Importers::AppleHealth.new.import
end

