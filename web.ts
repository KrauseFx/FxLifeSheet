declare var require: any;

// Third party dependencies
var http = require("http");
const moment = require("moment");
let postgres = require("./classes/postgres.js");

// State
var lastFetchedData = {};

function loadCurrentData(key) {
  console.log(`Refreshing latest ${key} entry...`);

  let query;
  if (key == "gym" || key == "meditated") {
    query =
      "SELECT * FROM raw_data WHERE key = '$1' AND value != '0' ORDER BY timestamp DESC LIMIT 1";
  } else {
    query =
      "SELECT * FROM raw_data WHERE key = '$1' ORDER BY timestamp DESC LIMIT 1";
  }

  console.log(query);
  postgres.client.query(
    {
      text: query,
      values: [key]
    },
    (err, res) => {
      console.log(res);
      if (err) {
        console.error(err);
        return;
      }

      let lastRow = res.rows[0];

      if (lastRow != null) {
        lastFetchedData[key] = {
          time: moment(Number(lastRow.timestamp)).format(),
          value: Number(lastRow.value)
        };
      }
    }
  );
}

console.log("Launching up API web server...");

// Periodically refresh the value
let interval = 5 * 60 * 1000;
let keys = [
  "mood",
  "sleepDurationWithings",
  "emailsInbox",
  "weight",
  "gym",
  "macrosCarbs",
  "macrosProtein",
  "macrosFat",
  "weeklyComputerTime",
  "dexaFatPercent",
  "meditated"
];
for (let i = 0; i < keys.length; i++) {
  let key = keys[i];
  setInterval(function() {
    loadCurrentData(key);
  }, interval);

  loadCurrentData(key);

  lastFetchedData[key] = {
    time: null,
    value: null
  };
}

// One-off total computer usage
postgres.client.query(
  {
    text: "SELECT SUM(value::int) FROM raw_data WHERE key = 'dailyComputerUse'"
  },
  (err, res) => {
    console.log(res);
    if (err) {
      console.error(err);
      return;
    }

    let hoursComputerUsed = res.rows[0]["sum"] / 60.0;
    // calculate up averages since we don't import RescueTime every day
    let daysDifference = moment().diff(moment("2020-03-22"), "days"); // that's when we imported last
    hoursComputerUsed += daysDifference * 6.5; // average computer usage a day nowadays

    lastFetchedData["totalComputerUsageHours"] = {
      time: moment().format(),
      value: Math.round(hoursComputerUsed)
    };
  }
);

http
  .createServer(function(req, res) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(JSON.stringify(lastFetchedData));
    return res.end();
  })
  .listen(process.env.PORT);

export {};
