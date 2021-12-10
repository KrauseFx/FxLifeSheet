require 'fileutils'

database_name = "fxlifesheet"
FileUtils.rm("latest.dump") if File.exists?("latest.dump")

puts `heroku pg:backups:capture`
puts `heroku pg:backups:download`
puts `dropdb '#{database_name}'`
puts `createdb '#{database_name}'`
puts `pg_restore --verbose --clean --no-acl --no-owner -h localhost -U postgres -d #{database_name} latest.dump`
FileUtils.rm("latest.dump")
