declare var require: any;

// Third party dependencies
const moment = require("moment");

// Internal dependencies
let config = require("./classes/config.js");
let postgres = require("./classes/postgres.js");
let telegram = require("./classes/telegram.js");

console.log("Checking if we need to send a reminder to the user...");

// Hacky, as fetching the config file takes a little while
setTimeout(function() {
  postgres.client.query(
    {
      text: "SELECT * FROM last_run"
    },
    (err, res) => {
      console.log(res);
      if (err) {
        console.error(err);
        return;
      }

      let rows = res.rows;

      for (let i = 0; i < rows.length; i++) {
        let currentRow = rows[i];
        let command = currentRow.command;
        let lastRun = moment(Number(currentRow.last_run));

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

        if (scheduleType == "eightTimesADay") {
          if (timeDifferenceHours >= 24 / 8) {
            shouldRemindUser = true;
          }
        } else if (scheduleType == "daily") {
          if (timeDifferenceHours >= 24 * 0.95) {
            // 0.95 to send that alert earlier to make it easier to tap
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
          postgres.client.query(
            {
              text: "UPDATE last_run SET last_message = $1 where command = $2",
              values: [moment().valueOf(), command]
            },
            (err, res) => {
              if (err) {
                console.log(err);
              }
              console.log(res);
            }
          );
        }
      }
      console.log("Reminder check done");
    }
  );
}, 2000);

export {};
