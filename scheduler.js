var cron = require("node-cron");
var moment = require("moment");
var config = require("./classes/config.js");
var postgres = require("./classes/postgres.js");
var telegram = require("./classes/telegram.js");

cron.schedule(`0 * * * *`, async () => {
  console.log("Checking if we need to send a reminder to the user...");

  // timeout to load the JSON file
  setTimeout(function() {
    postgres.client.query(
      {
        text: "SELECT * FROM last_run",
      },
      function(err, res) {
        if (err) {
          console.error(err);
          return;
        }
        var rows = res.rows;
        for (var i = 0; i < rows.length; i++) {
          var currentRow = rows[i];
          var command = currentRow.command;
          var lastRun = moment(Number(currentRow.last_run));
          if (config.userConfig[command] == null) {
            console.error(
              "Error, command not found, means it's not on the last run sheet, probably due to renaming a command: " +
                command
            );
            break;
          }
          var scheduleType = config.userConfig[command].schedule;
          var timeDifferenceHours = moment().diff(moment(lastRun), "hours");
          var shouldRemindUser = false;
          if (scheduleType == "eightTimesADay") {
            if (timeDifferenceHours >= 24 / 8) {
              shouldRemindUser = true;
            }
          } else if (scheduleType == "daily") {
            if (timeDifferenceHours >= 24 * 0.95) {
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
          } else {
            console.error("Unknown schedule type " + scheduleType);
          }
          var didJustSendMessage = false;
          if (currentRow.lastmessage) {
            var lastMessageSent = moment(Number(currentRow.lastmessage));
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
            var textToSend =
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
            postgres.client.query(
              {
                text:
                  "UPDATE last_run SET last_message = $1 where command = $2",
                values: [moment().valueOf(), command],
              },
              function(err, res) {
                if (err) {
                  console.log(err);
                }
              }
            );
          }
        }
        console.log("Reminder check done");
      }
    );
  }, 2000);
});
