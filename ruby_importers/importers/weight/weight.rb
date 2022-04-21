require_relative '../importer'
require 'net/http'
require 'csv'

module Importers
  class Weight < Importer
    def import
      weight_file.each do |current_date, values|
        weight = values[:weight]
        next unless weight > 0

        insert_row_for_date(
          key: "weight", 
          value: weight, 
          date: current_date, 
          type: "number",
          question: "Current weight",
          source: "weight", 
          import_id: import_id
        )

        current_date += 1
      end
    end

    private
    def import_id
      @_import_id ||= SecureRandom.hex
    end

    def weight_file
      @weight_file ||= CSV.read(File.join("importers", "weight", "renpho.csv"), headers: true).collect do |row|
        parsed = row["Date"].match(/(\d\d\/\d\d\/\d\d\d\d)/)[1]

        [
          Date.strptime(parsed, '%m/%d/%Y'),
          {
            weight: row["Weight"].to_f
          }
        ]
      end.to_h
    end
  end
end

if __FILE__ == $0
  Importers::Weight.new.import
end

