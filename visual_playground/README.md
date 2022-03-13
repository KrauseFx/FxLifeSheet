# Visual Playground Life Sheet

## Dependencies

```sh
bundle install
```

Create a `.keys` file in the current directory with the following content

```sh
export DATABASE_URL="postgresql://[url]"
export DEFAULT_MIN_DATE="2019-04"
```

## Run server

```sh
source .keys
```

```sh
bundle exec ruby server.rb
```

## Run frontend

```sh
python -m SimpleHTTPServer
```

and open 

[http://127.0.0.1:8000/frontend.html](http://127.0.0.1:8000/frontend.html)

## Examples

### frontend.html

<img width="600" alt="season-winter" src="https://user-images.githubusercontent.com/869950/158059535-6d8c0ec9-87e8-4264-b6b4-cd1d89f16a87.png">

<img width="600" alt="weight-sleeping-hr" src="https://user-images.githubusercontent.com/869950/158059552-67498231-23ef-4983-b010-ddcc4ede21e1.png">

### pie_chart.html

<img width="600" alt="manual-alcohol-intake-months" src="https://user-images.githubusercontent.com/869950/158059517-aba213e4-49a0-46b7-b427-e14fc813dce2.png">

<img width="600" alt="swarm-cities-top" src="https://user-images.githubusercontent.com/869950/158059524-fa09cadc-b0f2-404f-8a36-5e9e360646f6.png">

### github_style.html

<img width="600" alt="weather-temperature-max" src="https://user-images.githubusercontent.com/869950/158059507-95931303-98b2-45b4-a51c-ce1c95a1f1be.png">

### test_map.html

![map-world-overview](https://user-images.githubusercontent.com/869950/158059566-3f5c87ef-9103-4f71-b96e-73b2e690054b.jpg)




