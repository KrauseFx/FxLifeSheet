require_relative "importer"

module Importers
  class AddTimeRange < Importer
    def run(from:, to:, key:, value:, type:, question:)
      raise "invalid from to dates, check if they're in the right order" unless from < to
      (from..to).each do |date|
        if date > Date.today
          puts "Date is in the future, skipping now..."
          next
        end

        insert_row(
          date: date,
          key: key,
          value: value,
          type: type,
          question: question
        )
      end
    end

    def import(time_ranges:)
      time_ranges.each do |key, obj|
        existing_entries = raw_data.where(key: key)
        if existing_entries.count > 0
          puts "Already #{existing_entries.count} entries for #{key}, are you sure you want to replace all of those entries? (y/n)"
          raise "user cancelled" unless gets.strip == 'y'
          existing_entries.delete
          puts "Deleted..."
        end

        obj["values"].each_with_index do |range, index|
          raise "from < to for #{range}" if parse_date(range["to"]) < parse_date(range["from"])
          if index > 0
            raise "invalid range #{range}" unless parse_date(range["to"]) + 1 == parse_date(obj["values"][index - 1]["from"])
          end
        end
      end

      puts "Validated input file... Press enter to import the data now"
      gets

      time_ranges.each do |key, obj|    
        obj["values"].each do |range|      
          self.run(
            from: Date.strptime(range["from"], "%Y-%m-%d"),
            to: Date.strptime(range["to"], "%Y-%m-%d"),
            key: key,
            value: range.fetch("value"),
            type: obj.fetch("type"),
            question: obj.fetch("question")
          )
        end
      end
    end

    private
    def parse_date(date)
      Date.strptime(date, "%Y-%m-%d")
    end
  end
end

if __FILE__ == $0
  Importers::AddTimeRange.new.import(
    time_ranges: JSON.parse(File.read("importers/time_ranges.json"))
  )
end
