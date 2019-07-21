// Third party dependencies
var http = require("http");
const moment = require("moment");

// Internal dependencies
let google_sheets = require("./classes/google_sheets.js");

// State
var lastFetchedData = {};
let rawDataSheetRef = null;

google_sheets.setupGoogleSheets(initAPI);

function initAPI(rawDataSheet, lastRunSheet) {
  rawDataSheetRef = rawDataSheet;
  console.log("Launching up API web server...");

  // Periodically refresh the value
  let interval = 10 * 60 * 1000;
  let keys = [
    "mood",
    "sleepDuration",
    "weight",
    "dailySteps",
    "gym",
    "macrosCarbs",
    "macrosProtein",
    "macrosFat",
    "weeklyComputerTime",
    "weeklyPhoneTime"
  ];
  for (let i = 0; i < keys.length; i++) {
    let key = keys[i];
    setInterval(function() {
      loadCurrentData(key);
    }, interval + i * 2500);

    // to avoid rate limits
    setTimeout(function() {
      loadCurrentData(key);
    }, i * 2000);

    lastFetchedData[key] = {
      time: null,
      value: null
    };
  }

  http
    .createServer(function(req, res) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write(JSON.stringify(lastFetchedData));
      return res.end();
    })
    .listen(process.env.PORT);
}

function loadCurrentData(key) {
  console.log("Refreshing latest moood entry...");
  rawDataSheetRef.getRows(
    {
      offset: 0,
      limit: 1,
      orderby: "timestamp",
      reverse: true,
      query: "key=" + key
    },
    function(error, rows) {
      if (error) {
        console.error(error);
        return;
      }
      let lastRow = rows[0];
      // `lastMoodRow` is null if we haven't tracked a mood yet
      if (lastRow != null) {
        lastFetchedData[key] = {
          time: moment(Number(lastRow.timestamp)).format(),
          value: Number(lastRow.value)
        };
      }
    }
  );
}

export {};
