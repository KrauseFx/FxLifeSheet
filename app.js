// Third party dependencies
var moment = require("moment");
var needle = require("needle");
var http = require("http");
// Telegram setup
var Telegraf = require("telegraf");
var Router = Telegraf.Router, Markup = Telegraf.Markup, Extra = Telegraf.Extra;
var bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
// Sheets setup
var GoogleSpreadsheet = require("google-spreadsheet");
var async = require("async");
// spreadsheet key is the long id in the sheets URL
console.log("Loading " + process.env.GOOGLE_SHEETS_DOC_ID);
var doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_DOC_ID);
var rawDataSheet;
var lastRunSheet;
// State
var currentlyAskedQuestionObject = null;
var currentlyAskedQuestionMessageId = null; // The Telegram message ID reference
var currentlyAskedQuestionQueue = []; // keep track of all the questions about to be asked
var cachedCtx = null; // TODO: this obviously hsa to be removed and replaced with something better
var lastCommandReminder = {}; // to not spam the user on each interval
var lastMoodData = null; // used for the moods API
var userConfig = require("./lifesheet.json");
console.log("Loaded user config:");
console.log(userConfig);
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
            rawDataSheet = info.worksheets[0];
            lastRunSheet = info.worksheets[1];
            console.log("sheet 1: " +
                rawDataSheet.title +
                " " +
                rawDataSheet.rowCount +
                "x" +
                rawDataSheet.colCount);
            step();
        });
    }
], function (err) {
    if (err) {
        console.log("Error: " + err);
    }
    else {
        console.log("✅ Login successful, bot is running now");
        // App logic
        initBot();
        initScheduler();
        initMoodAPI();
    }
});
function getButtonText(number) {
    var emojiNumber = {
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
    var keyboard = Extra.markup(function (m) { return m.removeKeyboard(); }); // default keyboard
    var questionAppendix = "";
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
            .then(function (_a) {
            var message_id = _a.message_id;
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
    }
    else if (currentlyAskedQuestionObject.type == "boolean") {
        keyboard = Markup.keyboard([["1: Yes"], ["0: No"]])
            .oneTime()
            .extra();
    }
    else if (currentlyAskedQuestionObject.type == "text") {
        // use the default keyboard we set here anyway
        questionAppendix +=
            "You can use a Bear note, and then paste the deep link to the note here";
    }
    else if (currentlyAskedQuestionObject.type == "location") {
        keyboard = Extra.markup(function (markup) {
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
    var question = currentlyAskedQuestionObject.question + " (" + questionAppendix + ")";
    ctx.reply(question, keyboard).then(function (_a) {
        var message_id = _a.message_id;
        currentlyAskedQuestionMessageId = message_id;
    });
}
// App logic
function initBot() {
    // parse numeric/text inputs
    // `^([^\/].*)$` matches everything that doens't start with /
    // This will enable us to get any user inputs, including longer texts
    bot.hears(/^([^\/].*)$/, function (ctx) {
        parseUserInput(ctx);
    });
    // As we get no benefit of using `bot.command` to add commands, we might as well use
    // regexes, which then allows us to let the user's JSON define the available commands
    //
    // parse one-off commands:
    //
    // Those have to be above the regex match
    bot.hears("/report", function (ctx) {
        if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
            return;
        }
        console.log("Generating report...");
        ctx
            .replyWithPhoto({
            url: "https://datastudio.google.com/reporting/1a-1rVk-4ZFOg0WTNNGRvJDXMTNXpl5Uy/page/MpTm/thumbnail?sz=s3000"
        })
            .then(function (_a) {
            var message_id = _a.message_id;
            ctx.reply("Full report: https://datastudio.google.com/s/uwV1-Pv9dk4");
        });
    });
    bot.hears("/skip", function (ctx) {
        console.log("user is skipping this question");
        ctx
            .reply("Okay, skipping question. If you see yourself skipping a question too often, maybe it's time to rephrase or remove it")
            .then(function (_a) {
            var message_id = _a.message_id;
            triggerNextQuestionFromQueue(ctx);
        });
    });
    bot.on("location", function (ctx) {
        if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
            return;
        }
        var location = ctx.update.message.location;
        var lat = location.latitude;
        var lng = location.longitude;
        var url = "https://api.opencagedata.com/geocode/v1/json?q=" +
            lat +
            "+" +
            lng +
            "&key=" +
            process.env.OPEN_CAGE_API_KEY;
        needle.get(url, function (error, response, body) {
            if (error) {
                console.error(error);
            }
            var result = body["results"][0];
            // we have some custom handling of the data here, as we get
            // so much useful data, that we want to insert more rows here
            insertNewValue(lat, null, "locationLat", "number");
            insertNewValue(lng, null, "locationLng", "number");
            insertNewValue(result["components"]["country"], null, "locationCountry", "text");
            insertNewValue(result["components"]["country_code"], null, "locationCountryCode", "text");
            insertNewValue(result["formatted"], null, "locationAddress", "text");
            insertNewValue(result["components"]["continent"], null, "locationContinent", "text");
            insertNewValue(result["annotations"]["currency"]["name"], null, "locationCurrency", "text");
            insertNewValue(result["annotations"]["timezone"]["short_name"], null, "timezone", "text");
            var city = result["components"]["City"] || result["components"]["state"]; // vienna is not a city according to their API
            insertNewValue(city, null, "locationCity", "text");
        });
        var weatherURL = "https://api.apixu.com/v1/history.json?key=" +
            process.env.WEATHER_API_KEY +
            "&q=" +
            lat +
            ";" +
            lng +
            "&dt=" +
            moment().format("YYYY-MM-DD");
        // we use the `/history` API so we get the average/max/min temps of the day instead of the current one (late at night)
        needle.get(weatherURL, function (error, response, body) {
            if (error) {
                console.error(error);
            }
            var result = body["forecast"]["forecastday"][0];
            var resultDay = result["day"];
            insertNewValue(resultDay["avgtemp_c"], null, "weatherCelsius", "number");
            insertNewValue(resultDay["totalprecip_mm"], null, "weatherRain", "number");
            insertNewValue(resultDay["avghumidity"], null, "weatherHumidity", "number");
            var dayDurationHours = moment("2000-01-01 " + result["astro"]["sunset"]).diff(moment("2000-01-01 " + result["astro"]["sunrise"]), "minutes") / 60.0;
            insertNewValue(dayDurationHours, ctx, // hacky, we just pass this, so that we only sent a confirmation text once
            "weatherHoursOfSunlight", "number");
            // hacky, as at this point, the other http request might not be complete yet
            triggerNextQuestionFromQueue(ctx);
        });
    });
    // parse commands to start a survey
    bot.hears(/\/(\w+)/, function (ctx) {
        if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
            return;
        }
        cachedCtx = ctx;
        // user entered a command to start the survey
        var command = ctx.match[1];
        var matchingCommandObject = userConfig[command];
        if (matchingCommandObject && matchingCommandObject.questions) {
            console.log("User wants to run:");
            console.log(matchingCommandObject);
            saveLastRun(command);
            if (currentlyAskedQuestionQueue.length > 0 &&
                currentlyAskedQuestionMessageId) {
                // Happens when the user triggers another survey, without having completed the first one yet
                ctx.reply("^ Okay, but please answer my previous question also, thanks ^", Extra.inReplyTo(currentlyAskedQuestionMessageId));
            }
            currentlyAskedQuestionQueue = currentlyAskedQuestionQueue.concat(matchingCommandObject.questions.slice(0)); // slice is a poor human's .clone basicall
            if (currentlyAskedQuestionObject == null) {
                triggerNextQuestionFromQueue(ctx);
            }
        }
        else {
            ctx
                .reply("Sorry, I don't know how to run `/" + command)
                .then(function (_a) {
                var message_id = _a.message_id;
                sendAvailableCommands(ctx);
            });
        }
    });
    bot.start(function (ctx) { return ctx.reply("Welcome to FxLifeSheet"); });
    bot.help(function (ctx) { return ctx.reply("TODO: This will include the help section"); });
    bot.on("sticker", function (ctx) { return ctx.reply("Sorry, I don't support stickers"); });
    bot.hears("hi", function (ctx) { return ctx.reply("Hey there"); });
    // has to be last
    bot.launch();
}
function insertNewValue(parsedUserValue, ctx, key, type) {
    console.log("Inserting value '" + parsedUserValue + "' for key " + key);
    var dateToAdd = moment();
    var row = {
        Timestamp: dateToAdd.valueOf(),
        YearMonth: dateToAdd.format("YYYYMM"),
        YearWeek: dateToAdd.format("YYYYWW"),
        Year: dateToAdd.year(),
        Quarter: dateToAdd.quarter(),
        Month: dateToAdd.format("MM"),
        Day: dateToAdd.date(),
        Hour: dateToAdd.hours(),
        Minute: dateToAdd.minutes(),
        Week: dateToAdd.week(),
        Key: key,
        Question: currentlyAskedQuestionObject.question,
        Type: type,
        Value: parsedUserValue
    };
    rawDataSheet.addRow(row, function (error, row) {
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
            .reply("Sorry, I forgot the question I asked, this usually means it took too long for you to respond, please trigger the question again by running the `/` command")
            .then(function (_a) {
            var message_id = _a.message_id;
            sendAvailableCommands(ctx);
        });
        return;
    }
    // user replied with a value
    var userValue = ctx.match[1];
    var parsedUserValue = null;
    if (currentlyAskedQuestionObject.type != "text") {
        // First, see if it starts with emoji number, for which we have to do custom
        // parsing instead
        if (currentlyAskedQuestionObject.type == "range" ||
            currentlyAskedQuestionObject.type == "boolean") {
            var tryToParseNumber = parseInt(userValue[0]);
            if (!isNaN(tryToParseNumber)) {
                parsedUserValue = tryToParseNumber;
            }
            else {
                ctx.reply("Sorry, looks like your input is invalid, please enter a valid number from the selection", Extra.inReplyTo(ctx.update.message.message_id));
            }
        }
        if (parsedUserValue == null) {
            // parse the int/float, support both ints and floats
            userValue = userValue.match(/^(\d+(\.\d+)?)$/);
            if (userValue == null) {
                ctx.reply("Sorry, looks like you entered an invalid number, please try again", Extra.inReplyTo(ctx.update.message.message_id));
                return;
            }
            parsedUserValue = userValue[1];
        }
    }
    else {
        parsedUserValue = userValue; // raw value is fine
    }
    console.log("Got a new value: " +
        parsedUserValue +
        " for question " +
        currentlyAskedQuestionObject.key);
    if (currentlyAskedQuestionObject.replies &&
        currentlyAskedQuestionObject.replies[parsedUserValue]) {
        // Check if there is a custom reply, and if, use that
        ctx.reply(currentlyAskedQuestionObject.replies[parsedUserValue], Extra.inReplyTo(ctx.update.message.message_id));
    }
    insertNewValue(parsedUserValue, ctx, currentlyAskedQuestionObject.key, currentlyAskedQuestionObject.type);
    triggerNextQuestionFromQueue(ctx);
}
function sendAvailableCommands(ctx) {
    ctx.reply("Available commands:").then(function (_a) {
        var message_id = _a.message_id;
        ctx.reply("\n\n/skip\n/report\n\n/" + Object.keys(userConfig).join("\n/"));
    });
}
function saveLastRun(command) {
    lastRunSheet.getRows({
        offset: 1,
        limit: 100
    }, function (error, rows) {
        var updatedExistingRow = false;
        for (var i = 0; i < rows.length; i++) {
            var currentRow = rows[i];
            var currentCommand = currentRow.command;
            if (command == currentCommand) {
                updatedExistingRow = true;
                currentRow.lastrun = moment().valueOf(); // unix timestamp
                currentRow.save();
            }
        }
        if (!updatedExistingRow) {
            var row = {
                Command: command,
                LastRun: moment().valueOf() // unix timestamp
            };
            lastRunSheet.addRow(row, function (error, row) {
                console.log("Stored timestamp of last run for " + command);
            });
        }
    });
}
function initScheduler() {
    // Cron job to check if we need to run a given question again
    setInterval(function () {
        lastRunSheet.getRows({
            offset: 1,
            limit: 100
        }, function (error, rows) {
            for (var i = 0; i < rows.length; i++) {
                var currentRow = rows[i];
                var command = currentRow.command;
                var lastRun = moment(Number(currentRow.lastrun));
                if (userConfig[command] == null) {
                    console.error("Error, command not found, means it's not on the last run sheet, probably due to renaming a command: " +
                        command);
                    break;
                }
                var scheduleType = userConfig[command].schedule;
                var timeDifferenceHours = moment().diff(moment(lastRun), "hours"); //hours
                var shouldRemindUser = false;
                if (scheduleType == "fourTimesADay") {
                    if (timeDifferenceHours >= 24 / 4) {
                        shouldRemindUser = true;
                    }
                }
                else if (scheduleType == "daily") {
                    if (timeDifferenceHours >= 24 * 1.1) {
                        shouldRemindUser = true;
                    }
                }
                else if (scheduleType == "weekly") {
                    if (timeDifferenceHours >= 24 * 7 * 1.05) {
                        shouldRemindUser = true;
                    }
                }
                else if (scheduleType == "manual") {
                    // Never remind the user
                }
                else {
                    console.error("Unknown schedule type " + scheduleType);
                }
                var lastReminderDiffInHours = 100; // not reminded yet by default
                if (lastCommandReminder[command]) {
                    lastReminderDiffInHours = moment().diff(moment(Number(lastCommandReminder[command])), "hours");
                }
                if (shouldRemindUser &&
                    cachedCtx != null &&
                    lastReminderDiffInHours > 1) {
                    cachedCtx.reply("Please run /" +
                        command +
                        " again, it's been " +
                        timeDifferenceHours +
                        " hours since you last filled it out");
                    lastCommandReminder[command] = moment().valueOf(); // unix timestamp
                }
            }
        });
    }, 30000);
}
function initMoodAPI() {
    // needed for the API endpoint used by https://whereisfelix.today
    // Fetch the last entry from the before the container was spawned
    // From then on the cashe is refreshed when the user enters the value
    var currentMood = rawDataSheet.getRows({
        offset: 0,
        limit: 1,
        orderby: "timestamp",
        reverse: true,
        query: "key=mood"
    }, function (error, rows) {
        if (error) {
            console.error(error);
        }
        var lastMoodRow = rows[0];
        lastMoodData = {
            time: moment(Number(lastMoodRow.timestamp)).format(),
            value: Number(lastMoodRow.value)
        };
    });
    http
        .createServer(function (req, res) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.write(JSON.stringify(lastMoodData));
        return res.end();
    })
        .listen(process.env.PORT);
}
