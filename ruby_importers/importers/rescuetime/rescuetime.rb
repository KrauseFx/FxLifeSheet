require_relative '../importer'
require 'net/http'
require 'csv'

module Importers
  class RescueTime < Importer
    def import
      all_data = {}

      rescue_time_file.each do |row|
        matched_date = DateTime.parse(row[:timestamp])
        
        all_data[matched_date.to_date] ||= {applications: {}, categories: {}, application_types: {}, total_minutes: 0}
        all_data[matched_date.to_date][:total_minutes] += row[:seconds] / 60.0
        
        next unless row[:seconds] > 0 # since we'd also have entries with just a few seconds

        all_data[matched_date.to_date][:applications][row[:application]] ||= 0
        all_data[matched_date.to_date][:applications][row[:application]] += row[:seconds]

        all_data[matched_date.to_date][:categories][row[:category]] ||= 0
        all_data[matched_date.to_date][:categories][row[:category]] += row[:seconds]

        all_data[matched_date.to_date][:application_types][row[:application_type]] ||= 0
        all_data[matched_date.to_date][:application_types][row[:application_type]] += row[:seconds]
      end
      
      all_data.each do |matched_date, values|
        all_threads << Thread.new do
          insert_row_for_date(
            key: "rescue_time_daily_computer_used", 
            value: values[:total_minutes].round,
            date: matched_date, 
            type: "number",
            source: "rescuetime", 
            import_id: import_id
          )
        end
        wait_for_threads

        values[:applications].each do |application, seconds|
          next if seconds / 60 < 1
          all_threads << Thread.new do
            insert_row_for_date(
              key: "rescue_time_application_#{prettify(application)}", 
              value: (seconds / 60).round,
              date: matched_date, 
              type: "number",
              source: "rescuetime", 
              import_id: import_id
            )
          end
          wait_for_threads
        end

        values[:categories].each do |application, seconds|
          next if seconds / 60 < 1
          all_threads << Thread.new do
            insert_row_for_date(
              key: "rescue_time_category_#{prettify(application)}", 
              value: (seconds / 60).round,
              date: matched_date, 
              type: "number",
              source: "rescuetime", 
              import_id: import_id
            )
          end
          wait_for_threads
        end

        values[:application_types].each do |application, seconds|
          next if seconds / 60 < 1
          all_threads << Thread.new do
            insert_row_for_date(
              key: "rescue_time_application_types_#{prettify(application)}", 
              value: (seconds / 60).round,
              date: matched_date, 
              type: "number",
              source: "rescuetime", 
              import_id: import_id
            )
          end
          wait_for_threads
        end
      end
    end

    private
    def import_id
      @_import_id ||= SecureRandom.hex
    end

    def all_threads
      @all_threads ||= []
    end

    def wait_for_threads
      puts "#{all_threads.count} threads running"
      return if all_threads.count < 6
      puts "Waiting for #{all_threads.count} threads to finish"
      all_threads.each(&:join)
      @all_threads = []
    end

    def prettify(str)
      # TODO: Find a better solution
      str.gsub(" ", "_").gsub(".", "_").gsub("&", "_")
    end

    def rescue_time_file
      puts "Parsing RescueTime file, this might take a few seconds" if @rescue_time_file.nil?
      @rescue_time_file ||= CSV.read(File.join("importers", "rescuetime", "rescuetime-activity-history.csv"), headers: false).collect do |row|
        # e.g.
        # => ["2013-08-22 00:00:00 -0700", "adium", "No Details", "Communication & Scheduling", "Instant Message", "222"]
        # => ["2013-08-22 11:00:00 -0700", "ios simulator", "iOS Simulator - iPhone Retina (3.5-inch) / iOS 7.0 (11A4449b)", "Software Development", "General", "89"]
        {
          timestamp: row[0], # full hour
          application: row[1],
          details: row[2],
          category: row[3],
          application_type: row[4],
          seconds: row[5].to_i
        }
      end
    end
  end
end

if __FILE__ == $0
  Importers::RescueTime.new.import
end
