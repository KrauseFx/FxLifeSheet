// Third party dependencies
const moment = require("moment");
var needle = require("needle");
var http = require("http");

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
var lastMoodData = null; // used for the moods API

// Interfaces
interface Command {
  description: String;
  schedule: String;
  questions: [QuestionToAsk];
}

interface QuestionToAsk {
  key: String;
  question: String;
  type: String;
  buttons: { [key: string]: String };
  replies: { [key: string]: String };
}

let userConfig: { [key: string]: Command } = require("./lifesheet.json");
console.log("Successfully loaded user config");

console.log("Starting Google Sheets Login, this might take a few seconds...");
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
        for (let i = 0; i < info.worksheets.length; i++) {
          // we iterate over those and check the name, as we don't want to use indexes to access a sheet directly
          // to allow the user to order those sheets to however they want
          let currentSheet = info.worksheets[i];
          if (currentSheet.title.toLowerCase() == "rawdata") {
            rawDataSheet = currentSheet;
          } else if (currentSheet.title.toLowerCase() == "lastrun") {
            lastRunSheet = currentSheet;
          } else {
            console.log("Ignoring user's sheet named " + currentSheet.title);
          }
        }
        if (rawDataSheet == null || lastRunSheet == null) {
          console.error(
            "Something is wrong with the Sheet, please make sure to create 2 sheets: RawData and LastRun, according to the project's README and try again"
          );
          return;
        }

        console.log(
          "Found the relevant sheets, already " +
            rawDataSheet.rowCount +
            " existing data entries"
        );
        step();
      });
    }
  ],
  function(err) {
    if (err) {
      console.log("Error: " + err);
    } else {
      console.log("Google login successful");
      console.log("Setting up Telegram bot...");
      initBot();
      console.log("Setting up background scheduler...");
      initScheduler();
      console.log("Setting up web API");
      initMoodAPI();
      console.log("Boot up complete");
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
  let keyboard = Extra.markup(m => m.removeKeyboard()); // default keyboard
  let questionAppendix = "";

  currentlyAskedQuestionObject = currentlyAskedQuestionQueue.shift();

  if (currentlyAskedQuestionObject == null) {
    ctx.reply("All done for now, let's do this 💪", keyboard);
    // Finished
    return;
  }

  if (currentlyAskedQuestionObject.question == null) {
    console.error("No text defined for");
    console.error(currentlyAskedQuestionObject);
    // TODO: move this to centralized error handling
  }

  if (currentlyAskedQuestionObject.type == "header") {
    // This is information only, just print and go to the next one
    ctx
      .reply(currentlyAskedQuestionObject.question, keyboard)
      .then(({ message_id }) => {
        triggerNextQuestionFromQueue(ctx);
      });
    return;
  }

  // Looks like Telegram has some limitations:
  // - No way to use `force_reply` together with a custom keyboard (https://github.com/KrauseFx/FxLifeSheet/issues/5)
  // - No way to update existing messages together with a custom keyboard https://core.telegram.org/bots/api#updating-messages

  if (currentlyAskedQuestionObject.type == "range") {
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
  } else if (currentlyAskedQuestionObject.type == "boolean") {
    keyboard = Markup.keyboard([["1: Yes"], ["0: No"]])
      .oneTime()
      .extra();
  } else if (currentlyAskedQuestionObject.type == "text") {
    // use the default keyboard we set here anyway
    questionAppendix +=
      "You can use a Bear note, and then paste the deep link to the note here";
  } else if (currentlyAskedQuestionObject.type == "location") {
    keyboard = Extra.markup(markup => {
      return markup.keyboard([
        markup.locationRequestButton("📡 Send location")
      ]);
    });
  }

  questionAppendix = currentlyAskedQuestionQueue.length + " more question";
  if (currentlyAskedQuestionQueue.length != 1) {
    questionAppendix += "s";
  }
  if (currentlyAskedQuestionQueue.length == 0) {
    questionAppendix = "last question";
  }

  let question =
    currentlyAskedQuestionObject.question + " (" + questionAppendix + ")";
  ctx.reply(question, keyboard).then(({ message_id }) => {
    currentlyAskedQuestionMessageId = message_id;
  });
}

// App logic
function initBot() {
  // parse numeric/text inputs
  // `^([^\/].*)$` matches everything that doens't start with /
  // This will enable us to get any user inputs, including longer texts
  bot.hears(/^([^\/].*)$/, ctx => {
    parseUserInput(ctx);
  });

  // As we get no benefit of using `bot.command` to add commands, we might as well use
  // regexes, which then allows us to let the user's JSON define the available commands

  //
  // parse one-off commands:
  //
  // Those have to be above the regex match
  bot.hears("/report", ctx => {
    if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
      return;
    }

    console.log("Generating report...");
    ctx
      .replyWithPhoto({
        url:
          "https://datastudio.google.com/reporting/1a-1rVk-4ZFOg0WTNNGRvJDXMTNXpl5Uy/page/MpTm/thumbnail?sz=s3000"
      })
      .then(({ message_id }) => {
        ctx.reply("Full report: https://datastudio.google.com/s/uwV1-Pv9dk4");
      });
  });

  bot.hears("/skip", ctx => {
    console.log("user is skipping this question");
    ctx
      .reply(
        "Okay, skipping question. If you see yourself skipping a question too often, maybe it's time to rephrase or remove it"
      )
      .then(({ message_id }) => {
        triggerNextQuestionFromQueue(ctx);
      });
  });

  bot.on("location", ctx => {
    if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
      return;
    }
    if (currentlyAskedQuestionMessageId == null) {
      ctx
        .reply(
          "Sorry, I forgot the question I asked, this usually means it took too long for you to respond, please trigger the question again by running the `/` command"
        )
        .then(({ message_id }) => {
          sendAvailableCommands(ctx);
        });
      return;
    }
    let location = ctx.update.message.location;
    let lat = location.latitude;
    let lng = location.longitude;

    let url =
      "https://api.opencagedata.com/geocode/v1/json?q=" +
      lat +
      "+" +
      lng +
      "&key=" +
      process.env.OPEN_CAGE_API_KEY;
    console.log(url);

    needle.get(url, function(error, response, body) {
      if (error) {
        console.error(error);
      }
      let result = body["results"][0];

      // we have some custom handling of the data here, as we get
      // so much useful data, that we want to insert more rows here
      insertNewValue(lat, null, "locationLat", "number");
      insertNewValue(lng, null, "locationLng", "number");
      insertNewValue(
        result["components"]["country"],
        null,
        "locationCountry",
        "text"
      );
      insertNewValue(
        result["components"]["country_code"],
        null,
        "locationCountryCode",
        "text"
      );
      insertNewValue(result["formatted"], null, "locationAddress", "text");
      insertNewValue(
        result["components"]["continent"],
        null,
        "locationContinent",
        "text"
      );
      insertNewValue(
        result["annotations"]["currency"]["name"],
        null,
        "locationCurrency",
        "text"
      );
      insertNewValue(
        result["annotations"]["timezone"]["short_name"],
        null,
        "timezone",
        "text"
      );

      let city = result["components"]["city"] || result["components"]["state"]; // vienna is not a city according to their API
      insertNewValue(city, null, "locationCity", "text");
    });

    let today = moment();
    if (moment().hours() < 7) {
      // this is being run after midnight,
      // as I have the tendency to stay up until later
      // we will fetch the weather from yesterday
      today = moment().subtract("1", "day");
    }

    let weatherURL =
      "https://api.apixu.com/v1/history.json?key=" +
      process.env.WEATHER_API_KEY +
      "&q=" +
      lat +
      ";" +
      lng +
      "&dt=" +
      today.format("YYYY-MM-DD");

    console.log(weatherURL);

    // we use the `/history` API so we get the average/max/min temps of the day instead of the current one (late at night)
    needle.get(weatherURL, function(error, response, body) {
      if (error) {
        console.error(error);
      }

      let result = body["forecast"]["forecastday"][0];
      let resultDay = result["day"];
      insertNewValue(resultDay["avgtemp_c"], null, "weatherCelsius", "number");
      insertNewValue(
        resultDay["totalprecip_mm"],
        null,
        "weatherRain",
        "number"
      );
      insertNewValue(
        resultDay["avghumidity"],
        null,
        "weatherHumidity",
        "number"
      );

      let dayDurationHours =
        moment("2000-01-01 " + result["astro"]["sunset"]).diff(
          moment("2000-01-01 " + result["astro"]["sunrise"]),
          "minutes"
        ) / 60.0;

      insertNewValue(
        dayDurationHours,
        ctx, // hacky, we just pass this, so that we only sent a confirmation text once
        "weatherHoursOfSunlight",
        "number"
      );

      // hacky, as at this point, the other http request might not be complete yet
      triggerNextQuestionFromQueue(ctx);
    });
  });

  // parse commands to start a survey
  bot.hears(/\/(\w+)/, ctx => {
    if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
      return;
    }

    cachedCtx = ctx;
    // user entered a command to start the survey
    let command = ctx.match[1];
    let matchingCommandObject = userConfig[command];

    if (matchingCommandObject && matchingCommandObject.questions) {
      console.log("User wants to run:");
      console.log(matchingCommandObject);
      saveLastRun(command);
      if (
        currentlyAskedQuestionQueue.length > 0 &&
        currentlyAskedQuestionMessageId
      ) {
        // Happens when the user triggers another survey, without having completed the first one yet
        ctx.reply(
          "^ Okay, but please answer my previous question also, thanks ^",
          Extra.inReplyTo(currentlyAskedQuestionMessageId)
        );
      }

      currentlyAskedQuestionQueue = currentlyAskedQuestionQueue.concat(
        matchingCommandObject.questions.slice(0)
      ); // slice is a poor human's .clone basicall

      if (currentlyAskedQuestionObject == null) {
        triggerNextQuestionFromQueue(ctx);
      }
    } else {
      ctx
        .reply("Sorry, I don't know how to run `/" + command)
        .then(({ message_id }) => {
          sendAvailableCommands(ctx);
        });
    }
  });

  bot.start(ctx => ctx.reply("Welcome to FxLifeSheet"));

  bot.help(ctx => ctx.reply("TODO: This will include the help section"));
  bot.on("sticker", ctx => ctx.reply("Sorry, I don't support stickers"));
  bot.hears("hi", ctx => ctx.reply("Hey there"));

  // has to be last
  bot.launch();
}

function insertNewValue(parsedUserValue, ctx, key, type) {
  console.log("Inserting value '" + parsedUserValue + "' for key " + key);
  let dateToAdd = moment();

  let row = {
    Timestamp: dateToAdd.valueOf(),
    YearMonth: dateToAdd.format("YYYYMM"),
    YearWeek: dateToAdd.format("YYYYWW"),
    Year: dateToAdd.year(),
    Quarter: dateToAdd.quarter(),
    Month: dateToAdd.format("MM"), // to get the leading 0 needed for Google Data Studio
    Day: dateToAdd.date(),
    Hour: dateToAdd.hours(),
    Minute: dateToAdd.minutes(),
    Week: dateToAdd.week(),
    Key: key,
    Question: currentlyAskedQuestionObject.question,
    Type: type,
    Value: parsedUserValue
  };

  rawDataSheet.addRow(row, function(error, row) {
    if (error) {
      console.error(error);
      if (ctx) {
        ctx.reply("Error saving value: " + error);
      }
    }
    // TODO: replace with editing the existing message (ID in currentlyAskedQuestionMessageId, however couldn't get it to work)
    // if (ctx) {
    //   // we don't use this for location sending as we have many values for that
    //   ctx.reply("Success ✅", Extra.inReplyTo(currentlyAskedQuestionMessageId));
    // }
  });

  if (key == "mood") {
    // we only serve the current mood via an API
    lastMoodData = {
      time: dateToAdd,
      value: Number(parsedUserValue)
    };
  }
}

function parseUserInput(ctx) {
  if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
    return;
  }

  if (currentlyAskedQuestionMessageId == null) {
    ctx
      .reply(
        "Sorry, I forgot the question I asked, this usually means it took too long for you to respond, please trigger the question again by running the `/` command"
      )
      .then(({ message_id }) => {
        sendAvailableCommands(ctx);
      });
    return;
  }

  // user replied with a value
  let userValue = ctx.match[1];
  let parsedUserValue = null;

  if (currentlyAskedQuestionObject.type != "text") {
    // First, see if it starts with emoji number, for which we have to do custom
    // parsing instead
    if (
      currentlyAskedQuestionObject.type == "range" ||
      currentlyAskedQuestionObject.type == "boolean"
    ) {
      let tryToParseNumber = parseInt(userValue[0]);
      if (!isNaN(tryToParseNumber)) {
        parsedUserValue = tryToParseNumber;
      } else {
        ctx.reply(
          "Sorry, looks like your input is invalid, please enter a valid number from the selection",
          Extra.inReplyTo(ctx.update.message.message_id)
        );
      }
    }

    if (parsedUserValue == null) {
      // parse the int/float, support both ints and floats
      userValue = userValue.match(/^(\d+(\.\d+)?)$/);
      if (userValue == null) {
        ctx.reply(
          "Sorry, looks like you entered an invalid number, please try again",
          Extra.inReplyTo(ctx.update.message.message_id)
        );
        return;
      }
      parsedUserValue = userValue[1];
    }
  } else {
    parsedUserValue = userValue; // raw value is fine
  }

  console.log(
    "Got a new value: " +
      parsedUserValue +
      " for question " +
      currentlyAskedQuestionObject.key
  );

  if (
    currentlyAskedQuestionObject.replies &&
    currentlyAskedQuestionObject.replies[parsedUserValue]
  ) {
    // Check if there is a custom reply, and if, use that
    ctx.reply(
      currentlyAskedQuestionObject.replies[parsedUserValue],
      Extra.inReplyTo(ctx.update.message.message_id)
    );
  }

  insertNewValue(
    parsedUserValue,
    ctx,
    currentlyAskedQuestionObject.key,
    currentlyAskedQuestionObject.type
  );

  triggerNextQuestionFromQueue(ctx);
}

function sendAvailableCommands(ctx) {
  ctx.reply("Available commands:").then(({ message_id }) => {
    ctx.reply("\n\n/skip\n/report\n\n/" + Object.keys(userConfig).join("\n/"));
  });
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
            console.error(
              "Error, command not found, means it's not on the last run sheet, probably due to renaming a command: " +
                command
            );
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
          } else if (scheduleType == "monthly") {
            if (timeDifferenceHours >= 24 * 30 * 1.05) {
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

function initMoodAPI() {
  // needed for the API endpoint used by https://whereisfelix.today
  // Fetch the last entry from the before the container was spawned
  // From then on the cashe is refreshed when the user enters the value
  let currentMood = rawDataSheet.getRows(
    {
      offset: 0,
      limit: 1,
      orderby: "timestamp",
      reverse: true,
      query: "key=mood"
    },
    function(error, rows) {
      if (error) {
        console.error(error);
      }
      let lastMoodRow = rows[0];
      lastMoodData = {
        time: moment(Number(lastMoodRow.timestamp)).format(),
        value: Number(lastMoodRow.value)
      };
    }
  );

  http
    .createServer(function(req, res) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write(JSON.stringify(lastMoodData));
      return res.end();
    })
    .listen(process.env.PORT);
}
