// Third party dependencies
const moment = require("moment");

// Internal dependencies
let config = require("./classes/config.js");
let google_sheets = require("./classes/google_sheets.js");
let telegram = require("./classes/telegram.js");

google_sheets.setupGoogleSheets(runReminders);

function runReminders(rawDataSheet, lastRunSheet) {
  console.log("Checking if we need to send a reminder to the user...");

  lastRunSheet.getRows(
    {
      offset: 1,
      limit: 100
    },
    function(error, rows) {
      for (let i = 0; i < rows.length; i++) {
        let currentRow = rows[i];
        let command = currentRow.command;
        let lastRun = moment(Number(currentRow.lastrun));

        if (config.userConfig[command] == null) {
          console.error(
            "Error, command not found, means it's not on the last run sheet, probably due to renaming a command: " +
              command
          );
          break;
        }

        let scheduleType = config.userConfig[command].schedule;
        let timeDifferenceHours = moment().diff(moment(lastRun), "hours"); // hours
        var shouldRemindUser = false;

        if (scheduleType == "fourTimesADay") {
          if (timeDifferenceHours >= 24 / 4) {
            shouldRemindUser = true;
          }
        } else if (scheduleType == "daily") {
          if (timeDifferenceHours >= 24 * 1.1) {
            shouldRemindUser = true;
          }
        } else if (scheduleType == "weekly") {
          if (timeDifferenceHours >= 24 * 7 * 1.05) {
            shouldRemindUser = true;
          }
        } else if (scheduleType == "monthly") {
          if (timeDifferenceHours >= 24 * 30 * 1.05) {
            shouldRemindUser = true;
          }
        } else if (scheduleType == "manual") {
          // Never remind the user
        } else {
          console.error("Unknown schedule type " + scheduleType);
        }

        let didJustSendMessage = false;

        if (currentRow.lastmessage) {
          let lastMessageSent = moment(Number(currentRow.lastmessage));

          if (moment().diff(lastMessageSent, "hours") < 8) {
            didJustSendMessage = true;
          }
        }

        console.log(
          command +
            ": " +
            lastRun.format() +
            " should remind? " +
            shouldRemindUser +
            " time diff in h " +
            timeDifferenceHours +
            " didJustSendMessage " +
            didJustSendMessage
        );

        if (shouldRemindUser && !didJustSendMessage) {
          console.log("Reminding user to run questions again...");
          let textToSend =
            "Please run /" +
            command +
            " again, it's been " +
            timeDifferenceHours +
            " hours since you last filled it out";

          if (process.env.TELEGRAM_CHAT_ID == null) {
            console.error("Please set the `TELEGRAM_CHAT_ID` ENV variable");
          }
          telegram.bot.telegram.sendMessage(
            process.env.TELEGRAM_CHAT_ID,
            textToSend
          );
          currentRow.lastmessage = moment().valueOf(); // unix timestamp
          currentRow.save();
        }
      }
      console.log("Reminder check done");
    }
  );
}

export {};
