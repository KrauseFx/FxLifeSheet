"use strict";
exports.__esModule = true;
// Third party dependencies
var http = require("http");
var moment = require("moment");
// Internal dependencies
var google_sheets = require("./classes/google_sheets.js");
// State
var lastMoodData = null; // used for the moods API
var currentMood = null;
var rawDataSheetRef = null;
google_sheets.setupGoogleSheets(initMoodAPI);
function initMoodAPI(rawDataSheet, lastRunSheet) {
    rawDataSheetRef = rawDataSheet;
    console.log("Launching up API web server...");
    // Periodically refresh the value
    setInterval(loadCurrentMood, 5 * 60 * 1000);
    loadCurrentMood();
    http
        .createServer(function (req, res) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.write(JSON.stringify(lastMoodData));
        return res.end();
    })
        .listen(process.env.PORT);
}
function loadCurrentMood() {
    console.log("Refreshing latest moood entry...");
    // TODO: That `currentMood` assignment seems useless
    currentMood = rawDataSheetRef.getRows({
        offset: 0,
        limit: 1,
        orderby: "timestamp",
        reverse: true,
        query: "key=mood"
    }, function (error, rows) {
        if (error) {
            console.error(error);
            return;
        }
        var lastMoodRow = rows[0];
        // `lastMoodRow` is null if we haven't tracked a mood yet
        if (lastMoodRow != null) {
            lastMoodData = {
                time: moment(Number(lastMoodRow.timestamp)).format(),
                value: Number(lastMoodRow.value)
            };
        }
    });
}
