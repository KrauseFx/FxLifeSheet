"use strict";
exports.__esModule = true;
// Sheets setup
var GoogleSpreadsheet = require("google-spreadsheet");
var async = require("async");
// spreadsheet key is the long id in the sheets URL
console.log("Loading " + process.env.GOOGLE_SHEETS_DOC_ID);
var doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_DOC_ID);
var rawDataSheet;
var lastRunSheet;
function setupGoogleSheets(callback) {
    console.log("Starting Google Sheets Login, this might take a few seconds...");
    async.series([
        function setAuth(step) {
            var creds = {
                client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
                private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, "\n")
            };
            doc.useServiceAccountAuth(creds, step);
        },
        function getInfoAndWorksheets(step) {
            doc.getInfo(function (error, info) {
                if (error) {
                    console.error(error);
                }
                console.log("Loaded doc: " + info.title + " by " + info.author.email);
                for (var i = 0; i < info.worksheets.length; i++) {
                    // we iterate over those and check the name, as we don't want to use indexes to access a sheet directly
                    // to allow the user to order those sheets to however they want
                    var currentSheet = info.worksheets[i];
                    if (currentSheet.title.toLowerCase() == "rawdata") {
                        rawDataSheet = currentSheet;
                    }
                    else if (currentSheet.title.toLowerCase() == "lastrun") {
                        lastRunSheet = currentSheet;
                    }
                    else {
                        console.log("Ignoring user's sheet named " + currentSheet.title);
                    }
                }
                if (rawDataSheet == null || lastRunSheet == null) {
                    console.error("Something is wrong with the Sheet, please make sure to create 2 sheets: RawData and LastRun, according to the project's README and try again");
                    return;
                }
                console.log("Found the relevant sheets, already " +
                    rawDataSheet.rowCount +
                    " existing data entries");
                step();
            });
        }
    ], function (err) {
        if (err) {
            console.log("Error: " + err);
        }
        else {
            console.log("Google login successful");
            callback(rawDataSheet, lastRunSheet);
        }
    });
}
module.exports.setupGoogleSheets = setupGoogleSheets;
