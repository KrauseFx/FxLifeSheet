"use strict";
exports.__esModule = true;
var http = require("http");
var moment = require("moment");
var postgres = require("./classes/postgres.js");
var lastFetchedData = {};
function loadCurrentData(key) {
    console.log("Refreshing latest " + key + " entry...");
    var query;
    if (key == "gym" || key == "meditated") {
        query =
            "SELECT * FROM raw_data WHERE key = $1 AND value != '0' ORDER BY timestamp DESC LIMIT 1";
    }
    else {
        query =
            "SELECT * FROM raw_data WHERE key = $1 ORDER BY timestamp DESC LIMIT 1";
    }
    console.log(query);
    postgres.client.query({
        text: query,
        values: [key]
    }, function (err, res) {
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
postgres.client.query({
    text: "SELECT SUM(value::int) FROM raw_data WHERE key = 'rescue_time_daily_computer_used'"
}, function (err, res) {
    if (err) {
        console.error(err);
        return;
    }
    var hoursComputerUsed = res.rows[0]["sum"] / 60.0;
    var daysDifference = moment().diff(moment("2020-03-22"), "days");
    hoursComputerUsed += daysDifference * 6.5;
    lastFetchedData["totalComputerUsageHours"] = {
        time: moment().format(),
        value: Math.round(hoursComputerUsed)
    };
});
postgres.client.query({
    text: "SELECT COUNT(*) FROM raw_data"
}, function (err, res) {
    if (err) {
        console.error(err);
        return;
    }
    lastFetchedData["totalAmountOfEntries"] = {
        time: moment().format(),
        value: Number(res.rows[0]["count"])
    };
});
interval = 15 * 60 * 1000;
var keysStartingWith = ["rescue_time", "swarm", "weather", "dailySteps"];
function loadKeysCountData(key) {
    var keyPlusHash = key + "%";
    var query = "SELECT COUNT(*) AS value FROM raw_data WHERE key LIKE $1";
    console.log(query);
    postgres.client.query({
        text: query,
        values: [keyPlusHash]
    }, function (err, res) {
        if (err) {
            console.error(err);
            return;
        }
        var lastRow = res.rows[0];
        if (lastRow != null) {
            lastFetchedData[key] = {
                time: moment().format(),
                value: Number(lastRow.value)
            };
        }
    });
}
var _loop_2 = function (i) {
    var key = keysStartingWith[i];
    setInterval(function () {
        loadKeysCountData(key);
    }, interval);
    lastFetchedData[key] = {
        time: null,
        value: null
    };
    loadKeysCountData(key);
};
for (var i = 0; i < keysStartingWith.length; i++) {
    _loop_2(i);
}
postgres.client.query({
    text: "SELECT COUNT(*) AS value FROM raw_data WHERE source = 'tag_days' OR source = 'add_time_range'"
}, function (err, res) {
    lastFetchedData["timeRanges"] = {
        time: moment().format(),
        value: Number(res.rows[0].value)
    };
});
setInterval(function () {
    postgres.client.query({
        text: "SELECT COUNT(*) AS value FROM raw_data"
    }, function (err, res) {
        var manually = Number(res.rows[0].value) -
            lastFetchedData["timeRanges"].value -
            lastFetchedData["rescue_time"].value -
            lastFetchedData["swarm"].value -
            lastFetchedData["weather"].value -
            lastFetchedData["dailySteps"].value;
        lastFetchedData["manuallyEntered"] = {
            time: moment().format(),
            value: manually
        };
    });
}, 10000);
function updateOverviewTable() {
    var keysForDashboard = ["gym", "veggies", "withingsSleepingHR"];
    var queryToUse = "SELECT";
    var weekTimestamp = moment()
        .subtract(7, "days")
        .unix() * 1000;
    var monthTimestamp = moment()
        .subtract(30, "days")
        .unix() * 1000;
    var quarterTimestamp = moment()
        .subtract(90, "days")
        .unix() * 1000;
    var yearTimestamp = moment()
        .subtract(365, "days")
        .unix() * 1000;
    for (var i = 0; i < keysForDashboard.length; i++) {
        var athTimestamp = moment("2019-04-12").unix() * 1000;
        var key = keysForDashboard[i];
        if (key == "mood") {
            athTimestamp = moment("2018-02-01").unix() * 1000;
        }
        queryToUse += "(SELECT ROUND(AVG(value::numeric), 4) FROM raw_data WHERE timestamp > " + weekTimestamp + " AND key='" + key + "') as " + key + "Week,";
        queryToUse += "(SELECT ROUND(AVG(value::numeric), 4) FROM raw_data WHERE timestamp > " + monthTimestamp + " AND key='" + key + "') as " + key + "Month,";
        queryToUse += "(SELECT ROUND(AVG(value::numeric), 4) FROM raw_data WHERE timestamp > " + quarterTimestamp + " AND key='" + key + "') as " + key + "Quarter,";
        queryToUse += "(SELECT ROUND(AVG(value::numeric), 4) FROM raw_data WHERE timestamp > " + yearTimestamp + " AND key='" + key + "') as " + key + "Year,";
        queryToUse += "(SELECT ROUND(AVG(value::numeric), 4) FROM raw_data WHERE timestamp > " + athTimestamp + " AND key='" + key + "') as " + key + "AllTime,";
        queryToUse += "(SELECT COUNT(value::numeric) FROM raw_data WHERE timestamp > " + weekTimestamp + " AND key='" + key + "') as " + key + "WeekCount,";
        queryToUse += "(SELECT COUNT(value::numeric) FROM raw_data WHERE timestamp > " + monthTimestamp + " AND key='" + key + "') as " + key + "MonthCount,";
        queryToUse += "(SELECT COUNT(value::numeric) FROM raw_data WHERE timestamp > " + quarterTimestamp + " AND key='" + key + "') as " + key + "QuarterCount,";
        queryToUse += "(SELECT COUNT(value::numeric) FROM raw_data WHERE timestamp > " + yearTimestamp + " AND key='" + key + "') as " + key + "YearCount,";
        queryToUse += "(SELECT COUNT(value::numeric) FROM raw_data WHERE timestamp > " + athTimestamp + " AND key='" + key + "') as " + key + "AllTimeCount";
        if (i != keysForDashboard.length - 1) {
            queryToUse += ",";
        }
    }
    console.log(queryToUse);
    postgres.client.query({
        text: queryToUse
    }, function (err, res) {
        lastFetchedData["overviewTable"] = {
            time: moment().format(),
            value: res.rows[0]
        };
    });
}
setInterval(updateOverviewTable, 60 * 60 * 1000);
updateOverviewTable();
http
    .createServer(function (req, res) {
    res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept"
    });
    res.write(JSON.stringify(lastFetchedData));
    return res.end();
})
    .listen(process.env.PORT || 3000);
//# sourceMappingURL=web.js.map