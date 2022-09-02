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

function updateOverviewTable() {
  const keysForDashboard = ["gym", "veggies", "withingsSleepingHR"];
  let queryToUse = "SELECT";
  const weekTimestamp =
    moment()
      .subtract(7, "days")
      .unix() * 1000;
  const monthTimestamp =
    moment()
      .subtract(30, "days")
      .unix() * 1000;
  const quarterTimestamp =
    moment()
      .subtract(90, "days")
      .unix() * 1000;
  const yearTimestamp =
    moment()
      .subtract(365, "days")
      .unix() * 1000;

  for (let i = 0; i < keysForDashboard.length; i++) {
    let athTimestamp = moment("2019-04-12").unix() * 1000;

    let key = keysForDashboard[i];
    if (key == "mood") {
      athTimestamp = moment("2018-02-01").unix() * 1000;
    }
    queryToUse += `(SELECT ROUND(AVG(value::numeric), 4) FROM raw_data WHERE timestamp > ${weekTimestamp} AND key='${key}') as ${key}Week,`;
    queryToUse += `(SELECT ROUND(AVG(value::numeric), 4) FROM raw_data WHERE timestamp > ${monthTimestamp} AND key='${key}') as ${key}Month,`;
    queryToUse += `(SELECT ROUND(AVG(value::numeric), 4) FROM raw_data WHERE timestamp > ${quarterTimestamp} AND key='${key}') as ${key}Quarter,`;
    queryToUse += `(SELECT ROUND(AVG(value::numeric), 4) FROM raw_data WHERE timestamp > ${yearTimestamp} AND key='${key}') as ${key}Year,`;
    queryToUse += `(SELECT ROUND(AVG(value::numeric), 4) FROM raw_data WHERE timestamp > ${athTimestamp} AND key='${key}') as ${key}AllTime,`;
    queryToUse += `(SELECT COUNT(value::numeric) FROM raw_data WHERE timestamp > ${weekTimestamp} AND key='${key}') as ${key}WeekCount,`;
    queryToUse += `(SELECT COUNT(value::numeric) FROM raw_data WHERE timestamp > ${monthTimestamp} AND key='${key}') as ${key}MonthCount,`;
    queryToUse += `(SELECT COUNT(value::numeric) FROM raw_data WHERE timestamp > ${quarterTimestamp} AND key='${key}') as ${key}QuarterCount,`;
    queryToUse += `(SELECT COUNT(value::numeric) FROM raw_data WHERE timestamp > ${yearTimestamp} AND key='${key}') as ${key}YearCount,`;
    queryToUse += `(SELECT COUNT(value::numeric) FROM raw_data WHERE timestamp > ${athTimestamp} AND key='${key}') as ${key}AllTimeCount`;

    if (i != keysForDashboard.length - 1) {
      queryToUse += ",";
    }
  }
  console.log(queryToUse);
  postgres.client.query(
    {
      text: queryToUse
    },
    (err, res) => {
      lastFetchedData["overviewTable"] = {
        time: moment().format(),
        value: res.rows[0]
      };
    }
  );
}
setInterval(updateOverviewTable, 60 * 60 * 1000);
updateOverviewTable();

http
  .createServer(function(req, res) {
    // Verify the GET parameter "password" includes our keyphrase
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Origin, X-Requested-With, Content-Type, Accept"
    });
    res.write(JSON.stringify(lastFetchedData));
    return res.end();
  })
  .listen(process.env.PORT);

export {};
