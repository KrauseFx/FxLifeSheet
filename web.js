"use strict";
exports.__esModule = true;
// Third party dependencies
var http = require("http");
var moment = require("moment");
var postgres = require("./classes/postgres.js");
// State
var lastFetchedData = {};
function loadCurrentData(key) {
    console.log("Refreshing latest moood entry...");
    var query;
    if (key == "gym" || key == "meditated") {
        query =
            "SELECT * FROM raw_data WHERE key = $1 AND value != '0' ORDER BY timestamp DESC LIMIT 1";
    }
    else {
        query =
            "SELECT * FROM raw_data WHERE key = $1 ORDER BY timestamp DESC LIMIT 1";
    }
    postgres.client.query({
        text: query,
        values: [key]
    }, function (err, res) {
        console.log(res);
        if (err) {
            console.error(err);
            return;
        }
        var lastRow = res.rows[0];
        if (lastRow != null) {
            lastFetchedData[key] = {
                time: moment(Number(lastRow.timestamp)).format(),
                value: Number(lastRow.value)
            };
        }
    });
}
console.log("Launching up API web server...");
// Periodically refresh the value
var interval = 5 * 60 * 1000;
var keys = [
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
var _loop_1 = function (i) {
    var key = keys[i];
    setInterval(function () {
        loadCurrentData(key);
    }, interval);
    loadCurrentData(key);
    lastFetchedData[key] = {
        time: null,
        value: null
    };
};
for (var i = 0; i < keys.length; i++) {
    _loop_1(i);
}
// One-off total computer usage
postgres.client.query({
    text: "SELECT SUM(value::int) FROM raw_data WHERE key = 'dailyComputerUse'"
}, function (err, res) {
    console.log(res);
    if (err) {
        console.error(err);
        return;
    }
    var hoursComputerUsed = res.rows[0]["sum"] / 60.0;
    // calculate up averages since we don't import RescueTime every day
    var daysDifference = moment().diff(moment("2020-03-22"), "days"); // that's when we imported last
    hoursComputerUsed += daysDifference * 6.5; // average computer usage a day nowadays
    lastFetchedData["totalComputerUsageHours"] = {
        time: moment().format(),
        value: Math.round(hoursComputerUsed)
    };
});
http
    .createServer(function (req, res) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(JSON.stringify(lastFetchedData));
    return res.end();
})
    .listen(process.env.PORT);
