// Third party dependencies
const moment = require("moment");
var needle = require("needle");
const { Router, Markup, Extra } = require("telegraf");

// Internal dependencies
let config = require("./classes/config.js");
let google_sheets = require("./classes/google_sheets.js");
let telegram = require("./classes/telegram.js");

import { Command, QuestionToAsk } from "./classes/config.js";

let bot = telegram.bot;

// State
var currentlyAskedQuestionObject: QuestionToAsk = null;
var currentlyAskedQuestionMessageId: String = null; // The Telegram message ID reference
let currentlyAskedQuestionQueue: Array<QuestionToAsk> = []; // keep track of all the questions about to be asked
let rawDataSheet = null;
let lastRunSheet = null;

google_sheets.setupGoogleSheets(function(rawDataSheetRef, lastRunSheetRef) {
  rawDataSheet = rawDataSheetRef;
  lastRunSheet = lastRunSheetRef;

  initBot();
});

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

function printGraph(
  key,
  ctx,
  numberOfRecentValuesToPrint,
  additionalValue,
  skipImage
) {
  // additionalValue is the value that isn't part of the sheet yet
  // as it was *just* entered by the user
  let loadingMessageID = null;

  if (numberOfRecentValuesToPrint > 0) {
    ctx.reply("Loading history...").then(({ message_id }) => {
      loadingMessageID = message_id;
    });
  }

  rawDataSheet.getRows(
    {
      offset: 0,
      limit: 100,
      orderby: "timestamp",
      reverse: true,
      query: "key=" + key
    },
    function(error, rows) {
      if (error) {
        console.error(error);
        ctx.reply(error);
        return;
      }

      let allValues = [];
      let allTimes = [];
      let rawText = [];
      let minimum = 10000;
      let maximum = 0;
      for (let i = 0; i < rows.length; i++) {
        let time = moment(Number(rows[i].timestamp));
        let value = Number(rows[i].value);
        allValues.unshift(value);
        allTimes.unshift(time.format("MM-DD"));

        if (i < numberOfRecentValuesToPrint - 1) {
          rawText.unshift(time.format("YYYY-MM-DD") + ": " + value.toFixed(2));
        }

        if (value < minimum) {
          minimum = value;
        }
        if (value > maximum) {
          maximum = value;
        }
      }

      if (additionalValue) {
        allValues.push(additionalValue);
        allTimes.push(moment());

        rawText.push(
          moment().format("YYYY-MM-DD") +
            ": " +
            Number(additionalValue).toFixed(2)
        );
      }

      // Print the raw values
      if (numberOfRecentValuesToPrint > 0 && loadingMessageID) {
        ctx.telegram.editMessageText(
          ctx.update.message.chat.id,
          loadingMessageID,
          null,
          rawText.join("\n") + "\nMinimum: " + minimum + "\nMaximum: " + maximum
        );
      }

      // Generate the graph
      if (!skipImage) {
        minimum -= 2;
        maximum += 2;

        let url =
          "https://chart.googleapis.com/chart?cht=lc&chd=t:" +
          allValues.join(",") +
          "&chs=800x350&chl=" +
          allTimes.join("%7C") +
          "&chf=bg,s,e0e0e0&chco=000000,0000FF&chma=30,30,30,30&chds=" +
          minimum +
          "," +
          maximum;
        console.log(url);
        ctx.replyWithPhoto({
          url: url
        });
      }
    }
  );
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
    let allButtons = [
      [getButtonText("5")],
      [getButtonText("4")],
      [getButtonText("3")],
      [getButtonText("2")],
      [getButtonText("1")],
      [getButtonText("0")]
    ];
    shuffleArray(allButtons);
    keyboard = Markup.keyboard(allButtons)
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

  if (
    currentlyAskedQuestionObject.type == "number" ||
    currentlyAskedQuestionObject.type == "range" ||
    currentlyAskedQuestionObject.type == "boolean"
  ) {
    // To show the graph before, as it takes a while to load
    printGraph(currentlyAskedQuestionObject.key, ctx, 0, null, false);
  }
}

// Taken from https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function insertNewValue(parsedUserValue, ctx, key, type) {
  console.log("Inserting value '" + parsedUserValue + "' for key " + key);

  let dateToAdd = moment(ctx.update.message.date * 1000);
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

    if (ctx) {
      // we don't use this for location sending as we have many values for that, so that's when `ctx` is nil
      // Show that we saved the value
      // Currently the Telegram API doens't support updating of messages that have a custom keyboard
      // for no good reason, as mentioned here https://github.com/TelegramBots/telegram.bot/issues/176
      //
      // Bad Request: Message can't be edited
      //
      // Please note, that it is currently only possible to edit messages without reply_markup or with inline keyboards
      // ctx.telegram.editMessageText(
      //   ctx.update.message.chat.id,
      //   currentlyAskedQuestionMessageId,
      //   null,
      //   "✅ " + lastQuestionAskedDupe + " ✅"
      // );
    }
  });
}

function parseUserInput(ctx, text = null) {
  if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
    console.error("Invalid user " + ctx.update.message.from.username);
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
  let userValue;
  if (text != null) {
    userValue = text;
  } else {
    userValue = ctx.match[1];
  }

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

  if (currentlyAskedQuestionObject.type == "range") {
    // ensure the input is 0-6
    if (parsedUserValue < 0 || parsedUserValue > 6) {
      ctx.reply(
        "Please enter a value from 0 to 6",
        Extra.inReplyTo(ctx.update.message.message_id)
      );
      return;
    }
  }

  if (
    currentlyAskedQuestionObject.type == "number" ||
    currentlyAskedQuestionObject.type == "range" ||
    currentlyAskedQuestionObject.type == "boolean"
  ) {
    // To show potential streaks and the history
    printGraph(currentlyAskedQuestionObject.key, ctx, 5, parsedUserValue, true);
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

  setTimeout(function() {
    triggerNextQuestionFromQueue(ctx);
  }, 50); // timeout just to make sure the order is right
}

function sendAvailableCommands(ctx) {
  ctx.reply("Available commands:").then(({ message_id }) => {
    ctx.reply(
      "\n\n/skip\n/report\n\n/" + Object.keys(config.userConfig).join("\n/")
    );
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

function initBot() {
  console.log("Launching up Telegram bot...");

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
    if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
      console.error("Invalid user " + ctx.update.message.from.username);
      return;
    }

    console.log("user is skipping this question");
    ctx
      .reply(
        "Okay, skipping question. If you see yourself skipping a question too often, maybe it's time to rephrase or remove it"
      )
      .then(({ message_id }) => {
        triggerNextQuestionFromQueue(ctx);
      });
  });

  bot.hears("/skip_all", ctx => {
    if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
      return;
    }
    currentlyAskedQuestionQueue = [];
    ctx.reply("Okay, removing all questions that are currently in the queue");
  });

  bot.hears(/\/track (\w+)/, ctx => {
    if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
      console.error("Invalid user " + ctx.update.message.from.username);
      return;
    }

    let toTrack = ctx.match[1];
    console.log(
      "User wants to track a specific value, without the whole survey: " +
        toTrack
    );

    let questionToAsk: QuestionToAsk = null;

    Object.keys(config.userConfig).forEach(function(key) {
      var survey = config.userConfig[key];
      for (let i = 0; i < survey.questions.length; i++) {
        let currentQuestion = survey.questions[i];
        if (currentQuestion.key == toTrack) {
          questionToAsk = currentQuestion;
          return;
        }
      }
    });

    if (questionToAsk) {
      currentlyAskedQuestionQueue = currentlyAskedQuestionQueue.concat(
        questionToAsk
      );
      triggerNextQuestionFromQueue(ctx);
    } else {
      ctx.reply(
        "Sorry, I couldn't find the key `" +
          toTrack +
          "`, please make sure it's not mispelled"
      );
    }
  });

  bot.hears(/\/graph (\w+)/, ctx => {
    if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
      return;
    }

    let key = ctx.match[1];
    console.log("User wants to graph a specific value " + key);

    printGraph(key, ctx, 100, null, false);
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

    needle.get(url, function(error, response, body) {
      if (error) {
        console.error(error);
      }
      let result = body["results"][0];

      // we have some custom handling of the data here, as we get
      // so much useful data, that we want to insert more rows here
      insertNewValue(lat, ctx, "locationLat", "number");
      insertNewValue(lng, ctx, "locationLng", "number");
      insertNewValue(
        result["components"]["country"],
        ctx,
        "locationCountry",
        "text"
      );
      insertNewValue(
        result["components"]["country_code"],
        ctx,
        "locationCountryCode",
        "text"
      );
      insertNewValue(result["formatted"], ctx, "locationAddress", "text");
      insertNewValue(
        result["components"]["continent"],
        ctx,
        "locationContinent",
        "text"
      );
      insertNewValue(
        result["annotations"]["currency"]["name"],
        ctx,
        "locationCurrency",
        "text"
      );
      insertNewValue(
        result["annotations"]["timezone"]["short_name"],
        ctx,
        "timezone",
        "text"
      );

      let city = result["components"]["city"] || result["components"]["state"]; // vienna is not a city according to their API
      insertNewValue(city, ctx, "locationCity", "text");
    });

    let today = moment();
    if (moment().hours() < 10) {
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

    // we use the `/history` API so we get the average/max/min temps of the day instead of the current one (late at night)
    needle.get(weatherURL, function(error, response, body) {
      if (error) {
        console.error(error);
      }

      let result = body["forecast"]["forecastday"][0];
      let resultDay = result["day"];
      insertNewValue(resultDay["avgtemp_c"], ctx, "weatherCelsius", "number");
      insertNewValue(resultDay["totalprecip_mm"], ctx, "weatherRain", "number");
      insertNewValue(
        resultDay["avghumidity"],
        ctx,
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

    // user entered a command to start the survey
    let command = ctx.match[1];
    let matchingCommandObject = config.userConfig[command];

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
      ); // slice is a poor human's .clone basically

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
  bot.on(["voice", "video_note"], ctx => {
    if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
      return;
    }
    let message = ctx.message || ctx.update.channel_post;
    let voice =
      message.voice || message.document || message.audio || message.video_note;
    let file_id = voice.file_id;
    let transcribingMessageId = null;

    console.log("Received voice with file ID '" + file_id + "'");
    ctx
      .reply(
        "🦄 Received message, transcribing now...",
        Extra.inReplyTo(ctx.message.message_id)
      )
      .then(({ message_id }) => {
        transcribingMessageId = message_id;
      });

    let transcribeURL = "https://bubbles-transcribe.herokuapp.com/transcribe";
    transcribeURL += "?file_id=" + file_id;
    transcribeURL += "&language=en-US";
    transcribeURL += "&telegram_token=" + process.env.TELEGRAM_BOT_TOKEN;

    needle.get(transcribeURL, function(error, response, body) {
      if (error) {
        console.error(error);
        ctx.reply("Error: " + error, Extra.inReplyTo(ctx.message.message_id));
      }
      let text = JSON.parse(body)["text"];

      ctx.telegram.editMessageText(
        ctx.update.message.chat.id,
        transcribingMessageId,
        null,
        text
      );

      if (text != null && text.length > 5) {
        parseUserInput(ctx, text);
      }
    });
  });

  bot.help(ctx =>
    ctx.reply(
      "No in-bot help right now, for now please visit https://github.com/KrauseFx/FxLifeSheet"
    )
  );
  bot.on("sticker", ctx => ctx.reply("Sorry, I don't support stickers"));
  bot.hears("hi", ctx => ctx.reply("Hey there"));

  // has to be last
  bot.launch();
}

export {};
