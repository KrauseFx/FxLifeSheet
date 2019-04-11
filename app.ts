// Third party dependencies
const moment = require("moment");
var needle = require("needle");

// Telegram setup
const Telegraf = require("telegraf");
const { Router, Markup, Extra } = Telegraf;

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Sheets setup
var GoogleSpreadsheet = require("google-spreadsheet");
var async = require("async");

// spreadsheet key is the long id in the sheets URL
console.log("Loading " + process.env.GOOGLE_SHEETS_DOC_ID);
var doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_DOC_ID);
var rawDataSheet;
var lastRunSheet;

// State
var currentlyAskedQuestionObject: QuestionToAsk = null;
var currentlyAskedQuestionMessageId: String = null; // The Telegram message ID reference
let currentlyAskedQuestionQueue: Array<QuestionToAsk> = []; // keep track of all the questions about to be asked
var cachedCtx = null; // TODO: this obviously hsa to be removed and replaced with something better
var lastCommandReminder: { [key: string]: Number } = {}; // to not spam the user on each interval

interface QuestionToAsk {
  key: String;
  human: String;
  question: String;
  type: String; // TODO: replace
  buttons: { [key: string]: String };
  replies: { [key: string]: String };
}

// Interfaces
interface Command {
  description: String;
  schedule: String; // TODO: replace
  values: Array<QuestionToAsk>;
}

let userConfig: { [key: string]: Command } = require("./lifesheet.json");
console.log("Loaded user config:");
console.log(userConfig);

async.series(
  [
    function setAuth(step) {
      var creds = {
        client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, "\n")
      };

      doc.useServiceAccountAuth(creds, step);
    },
    function getInfoAndWorksheets(step) {
      doc.getInfo(function(error, info) {
        if (error) {
          console.error(error);
        }
        console.log("Loaded doc: " + info.title + " by " + info.author.email);
        rawDataSheet = info.worksheets[0];
        lastRunSheet = info.worksheets[1];
        console.log(
          "sheet 1: " +
            rawDataSheet.title +
            " " +
            rawDataSheet.rowCount +
            "x" +
            rawDataSheet.colCount
        );
        step();
      });
    }
  ],
  function(err) {
    if (err) {
      console.log("Error: " + err);
    } else {
      console.log("✅ Login successful, bot is running now");
      // App logic
      initBot();
      initScheduler();
    }
  }
);

function getButtonText(number) {
  let emojiNumber = {
    "0": "0️⃣",
    "1": "1️⃣",
    "2": "2️⃣",
    "3": "3️⃣",
    "4": "4️⃣",
    "5": "5️⃣"
  }[number];

  if (currentlyAskedQuestionObject.buttons == null) {
    // Assign default values
    currentlyAskedQuestionObject.buttons = {
      "0": "Terrible",
      "1": "Bad",
      "2": "Okay",
      "3": "Good",
      "4": "Great",
      "5": "Excellent"
    };
  }

  return emojiNumber + " " + currentlyAskedQuestionObject.buttons[number];
}

function triggerNextQuestionFromQueue(ctx) {
  let currentQuestion = currentlyAskedQuestionQueue.shift();
  currentlyAskedQuestionObject = currentQuestion;

  if (currentQuestion == null) {
    ctx.reply("All done for now, let's do this 💪");
    // Finished
    return;
  }

  // Looks like Telegram has some limitations:
  // - No way to use `force_reply` together with a custom keyboard (https://github.com/KrauseFx/FxLifeSheet/issues/5)
  // - No way to update existing messages together with a custom keyboard https://core.telegram.org/bots/api#updating-messages
  let keyboard = null;

  if (currentQuestion.type == "range") {
    keyboard = Markup.keyboard([
      [getButtonText("5")],
      [getButtonText("4")],
      [getButtonText("3")],
      [getButtonText("2")],
      [getButtonText("1")],
      [getButtonText("0")]
    ])
      .oneTime()
      .extra();
  } else {
    keyboard = Extra.markup(m => m.removeKeyboard());
  }
  }

  let question =
    currentQuestion.question +
    " (" +
    currentlyAskedQuestionQueue.length +
    " more questions)";
  ctx.reply(question, keyboard).then(({ message_id }) => {
    currentlyAskedQuestionMessageId = message_id;
  });
}

// App logic
function initBot() {
  bot.hears(/(\d+)/, ctx => {
    if (currentlyAskedQuestionMessageId == null) {
      ctx.reply(
        "Sorry, I forgot the question I asked, this usually means it took too long for you to respond, please trigger the question again by running the `/` command"
      );
      return;
    }

    // user replied with a value
    let userValue = ctx.match[1];
    console.log(
      "Got a new value: " +
        userValue +
        " for question " +
        currentlyAskedQuestionObject.key
    );

    if (
      currentlyAskedQuestionObject.replies &&
      currentlyAskedQuestionObject.replies[userValue]
    ) {
      // Check if there is a custom reply, and if, use that
      ctx.reply(
        currentlyAskedQuestionObject.replies[userValue],
        Extra.inReplyTo(ctx.update.message.message_id)
      );
    }

    let dateToAdd = moment();
    let row = {
      Timestamp: dateToAdd.format(),
      Year: dateToAdd.year(),
      Month: dateToAdd.month() + 1,
      Day: dateToAdd.date(),
      Hour: dateToAdd.hours(),
      Minute: dateToAdd.minutes(),
      Week: dateToAdd.week(),
      Quarter: dateToAdd.quarter(),
      Key: currentlyAskedQuestionObject.key,
      Type: currentlyAskedQuestionObject.type,
      Value: userValue
    };

    rawDataSheet.addRow(row, function(error, row) {
      // TODO: replace with editing the existing message (ID in currentlyAskedQuestionMessageId, however couldn't get it to work)
      // ctx.reply("Success ✅", Extra.inReplyTo(currentlyAskedQuestionMessageId));
    });

    triggerNextQuestionFromQueue(ctx);
  });

  // As we get no benefit of using `bot.command` to add commands, we might as well use
  // regexes, which then allows us to let the user's JSON define the available commands

  bot.hears("/report", ({ replyWithPhoto }) => {
    console.log("Generating report...");
    replyWithPhoto({
      url:
        "https://datastudio.google.com/reporting/1a-1rVk-4ZFOg0WTNNGRvJDXMTNXpl5Uy/page/MpTm/thumbnail?sz=s3000"
    }).then(({ message_id }) => {
      console.log("Success");
    });
  });

  bot.hears(/\/(\w+)/, ctx => {
    cachedCtx = ctx;
    // user entered a command to start the survey
    let command = ctx.match[1];
    let matchingCommandObject = userConfig[command];

    if (matchingCommandObject && matchingCommandObject.values) {
      console.log("User wants to run:");
      console.log(matchingCommandObject);
      saveLastRun(command);
      if (currentlyAskedQuestionQueue.length > 0) {
        ctx.reply(
          "^ Okay, but please answer my previous question also, thanks ^",
          Extra.inReplyTo(currentlyAskedQuestionMessageId)
        );
      }
      currentlyAskedQuestionQueue = currentlyAskedQuestionQueue.concat(
        matchingCommandObject.values.slice(0)
      ); // slice is a poor human's .clone basically
      if (currentlyAskedQuestionObject == null) {
        triggerNextQuestionFromQueue(ctx);
      }
    }
  });

  bot.start(ctx => ctx.reply("Welcome to FxLifeSheet"));

  bot.help(ctx => ctx.reply("TODO: This will include the help section"));
  bot.on("sticker", ctx => ctx.reply("Sorry, I don't support stickers"));
  bot.hears("hi", ctx => ctx.reply("Hey there"));

  // has to be last
  bot.launch();
}

function saveLastRun(command) {
  lastRunSheet.getRows(
    {
      offset: 1,
      limit: 100
    },
    function(error, rows) {
      var updatedExistingRow = false;
      for (let i = 0; i < rows.length; i++) {
        let currentRow = rows[i];
        let currentCommand = currentRow.command;
        if (command == currentCommand) {
          updatedExistingRow = true;

          currentRow.lastrun = moment().valueOf(); // unix timestamp
          currentRow.save();
        }
      }

      if (!updatedExistingRow) {
        let row = {
          Command: command,
          LastRun: moment().valueOf() // unix timestamp
        };
        lastRunSheet.addRow(row, function(error, row) {
          console.log("Stored timestamp of last run for " + command);
        });
      }
    }
  );
}

function initScheduler() {
  // Cron job to check if we need to run a given question again
  setInterval(function() {
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

          if (userConfig[command] == null) {
            console.error("Error, command not found: " + command);
            break;
          }

          let scheduleType = userConfig[command].schedule;
          let timeDifferenceHours = moment().diff(moment(lastRun), "hours"); //hours
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
          } else if (scheduleType == "manual") {
            // Never remind the user
          } else {
            console.error("Unknown schedule type " + scheduleType);
          }

          let lastReminderDiffInHours = 100; // not reminded yet by default
          if (lastCommandReminder[command]) {
            lastReminderDiffInHours = moment().diff(
              moment(Number(lastCommandReminder[command])),
              "hours"
            );
          }

          if (
            shouldRemindUser &&
            cachedCtx != null &&
            lastReminderDiffInHours > 1
          ) {
            cachedCtx.reply(
              "Please run /" +
                command +
                " again, it's been " +
                timeDifferenceHours +
                " hours since you last filled it out"
            );
            lastCommandReminder[command] = moment().valueOf(); // unix timestamp
          }
        }
      }
    );
  }, 30000);
}
