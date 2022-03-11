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
      "SELECT * FROM raw_data WHERE key = $1 AND value != '0' ORDER BY timestamp DESC LIMIT 1";
  } else {
    query =
      "SELECT * FROM raw_data WHERE key = $1 ORDER BY timestamp DESC LIMIT 1";
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
    text:
      "SELECT SUM(value::int) FROM raw_data WHERE key = 'rescue_time_daily_computer_used'"
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

// One-off query to get the total amount of entries
postgres.client.query(
  {
    text: "SELECT COUNT(*) FROM raw_data"
  },
  (err, res) => {
    console.log(res);
    if (err) {
      console.error(err);
      return;
    }

    lastFetchedData["totalAmountOfEntries"] = {
      time: moment().format(),
      value: Number(res.rows[0]["count"])
    };
  }
);

// Periodically refresh the total amount of entries
interval = 15 * 60 * 1000;
const keysStartingWith = ["rescue_time", "swarm", "weather", "dailySteps"];
function loadKeysCountData(key) {
  const keyPlusHash = key + "%";
  const query = "SELECT COUNT(*) AS value FROM raw_data WHERE key LIKE $1";

  console.log(query);
  postgres.client.query(
    {
      text: query,
      values: [keyPlusHash]
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
          time: moment().format(),
          value: Number(lastRow.value)
        };
      }
    }
  );
}

for (let i = 0; i < keysStartingWith.length; i++) {
  let key = keysStartingWith[i];
  setInterval(function() {
    loadKeysCountData(key);
  }, interval);

  lastFetchedData[key] = {
    time: null,
    value: null
  };
  loadKeysCountData(key);
}

// One Off to fetch manually entered, and time ranges
postgres.client.query(
  {
    text:
      "SELECT COUNT(*) AS value FROM raw_data WHERE source = 'tag_days' OR source = 'add_time_range'"
  },
  (err, res) => {
    lastFetchedData["timeRanges"] = {
      time: moment().format(),
      value: Number(res.rows[0].value)
    };
  }
);

setInterval(function() {
  postgres.client.query(
    {
      text: "SELECT COUNT(*) AS value FROM raw_data"
    },
    (err, res) => {
      const manually =
        Number(res.rows[0].value) -
        lastFetchedData["timeRanges"].value -
        lastFetchedData["rescue_time"].value -
        lastFetchedData["swarm"].value -
        lastFetchedData["weather"].value -
        lastFetchedData["dailySteps"].value;
      lastFetchedData["manuallyEntered"] = {
        time: moment().format(),
        value: manually
      };
    }
  );
}, 10000);

http
  .createServer(function(req, res) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(JSON.stringify(lastFetchedData));
    return res.end();
  })
  .listen(process.env.PORT);

export {};
