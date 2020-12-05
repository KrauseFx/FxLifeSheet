require "sinatra"
require_relative "./api"
require "pry"

api = API.new

get "/" do
  File.read("frontend.html")
end

def json_response
  content_type 'application/json'
  response['Access-Control-Allow-Origin'] = 'http://127.0.0.1:8000'
end

get "/data" do
  json_response

  JSON.pretty_generate(api.fetch(
    key: params.fetch("key"),
    group_by: params.fetch("group_by", "month"),
    start_date: params.fetch("start_date", ENV["DEFAULT_MIN_DATE"].strip)
  ))
end

get "/keys" do
  json_response

  JSON.pretty_generate(api.list_keys)
end
