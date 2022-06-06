require_relative '../importer'
require 'net/http'
require 'csv'

module Importers
  class Instapipe < Importer
    def import
      current_date = Time.at(instapipe_database[:stories].order(:timestamp).first[:timestamp]).to_date
      while current_date < (Date.today - 2)
        # Find all entries that happened on that date
        stories = instapipe_database[:stories].where(timestamp: (current_date.to_time.to_i)..((current_date + 1).to_time.to_i))
        views = instapipe_database[:views].where(date: current_date).first
        insert_row_for_date(
          key: "instapipe_number_of_stories", 
          value: stories.count, 
          date: current_date, 
          type: "number",
          question: "Instapipe number of stories",
          source: "instapipe", 
          import_id: import_id
        )
        if views
          insert_row_for_date(
            key: "instapipe_views", 
            value: views[:count], 
            date: current_date, 
            type: "number",
            question: "Instapipe number of views",
            source: "instapipe", 
            import_id: import_id
          )
          insert_row_for_date(
            key: "instapipe_prefetches", 
            value: views[:prefetches], 
            date: current_date, 
            type: "number",
            question: "Instapipe number of prefetches",
            source: "instapipe", 
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

    def instapipe_database
      @_instapipe_db ||= Sequel.connect(ENV.fetch("INSTAPIPE_DATABASE_URL"))
    end
  end
end

if __FILE__ == $0
  Importers::Instapipe.new.import
end

