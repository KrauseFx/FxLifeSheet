"use strict";
exports.__esModule = true;
// Third party dependencies
var moment = require("moment");
var needle = require("needle");
var _a = require("telegraf"), Router = _a.Router, Markup = _a.Markup, Extra = _a.Extra;
// Internal dependencies
var config = require("./classes/config.js");
var postgres = require("./classes/postgres.js");
var telegram = require("./classes/telegram.js");
var bot = telegram.bot;
// State
var currentlyAskedQuestionObject = null;
var currentlyAskedQuestionMessageId = null; // The Telegram message ID reference
var currentlyAskedQuestionQueue = []; // keep track of all the questions about to be asked
initBot();
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
function printGraph(key, ctx, numberOfRecentValuesToPrint, additionalValue, skipImage) {
    postgres.client.query({
        text: "SELECT * FROM raw_data WHERE key = $1 ORDER BY timestamp DESC LIMIT 300",
        values: [key]
    }, function (err, res) {
        console.log(res);
        if (err) {
            console.error(err);
            ctx.reply(err);
            return;
        }
        var rows = res.rows;
        console.log("Rows: " + rows.length);
        var allValues = [];
        var allTimes = [];
        var rawText = [];
        var minimum = 10000;
        var maximum = 0;
        for (var i = 0; i < rows.length; i++) {
            var time = moment(Number(rows[i].timestamp));
            var value = Number(rows[i].value);
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
            rawText.push(moment().format("YYYY-MM-DD") +
                ": " +
                Number(additionalValue).toFixed(2));
        }
        // Print the raw values
        if (numberOfRecentValuesToPrint > 0) {
            ctx.reply(rawText.join("\n") + "\nMinimum: " + minimum + "\nMaximum: " + maximum);
        }
        // Generate the graph
        if (!skipImage) {
            minimum -= 2;
            maximum += 2;
            var url = "https://chart.googleapis.com/chart?cht=lc&chd=t:" +
                allValues.join(",") +
                "&chs=800x350&chl=" +
                allTimes.join("%7C") +
                "&chtt=" +
                key +
                "&chf=bg,s,e0e0e0&chco=000000,0000FF&chma=30,30,30,30&chds=" +
                minimum +
                "," +
                maximum;
            console.log(url);
            ctx.replyWithPhoto({
                url: url
            });
        }
    });
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
        var allButtons = [
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
    if (currentlyAskedQuestionObject.type == "number" ||
        currentlyAskedQuestionObject.type == "range" ||
        currentlyAskedQuestionObject.type == "boolean") {
        // To show the graph before, as it takes a while to load
        printGraph(currentlyAskedQuestionObject.key, ctx, 0, null, false);
    }
}
// Taken from https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
function shuffleArray(array) {
    var _a;
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        _a = [array[j], array[i]], array[i] = _a[0], array[j] = _a[1];
    }
}
function insertNewValue(parsedUserValue, ctx, key, type, fakeDate) {
    if (fakeDate === void 0) { fakeDate = null; }
    console.log("Inserting value '" + parsedUserValue + "' for key " + key);
    var dateToAdd;
    if (fakeDate) {
        dateToAdd = fakeDate;
    }
    else {
        dateToAdd = moment(ctx.update.message.date * 1000);
    }
    var questionText = null;
    if (currentlyAskedQuestionObject) {
        questionText = currentlyAskedQuestionObject.question;
    }
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
        Question: questionText,
        Type: type,
        Value: parsedUserValue
    };
    postgres.client.query({
        text: "INSERT INTO raw_data (" +
            Object.keys(row).join(",") +
            ") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)",
        values: Object.values(row)
    }, function (err, res) {
        console.log(res);
        if (err) {
            ctx.reply("Error saving value: " + err);
            console.log(err.stack);
        }
        else {
        }
    });
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
}
function parseUserInput(ctx, text) {
    if (text === void 0) { text = null; }
    if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
        console.error("Invalid user " + ctx.update.message.from.username);
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
    var userValue;
    if (text != null) {
        userValue = text;
    }
    else {
        userValue = ctx.match[1];
    }
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
    if (currentlyAskedQuestionObject.type == "range") {
        // ensure the input is 0-6
        if (parsedUserValue < 0 || parsedUserValue > 6) {
            ctx.reply("Please enter a value from 0 to 6", Extra.inReplyTo(ctx.update.message.message_id));
            return;
        }
    }
    if (currentlyAskedQuestionObject.type == "number" ||
        currentlyAskedQuestionObject.type == "range" ||
        currentlyAskedQuestionObject.type == "boolean") {
        // To show potential streaks and the history
        printGraph(currentlyAskedQuestionObject.key, ctx, 5, parsedUserValue, true);
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
    setTimeout(function () {
        triggerNextQuestionFromQueue(ctx);
    }, 50); // timeout just to make sure the order is right
}
function sendAvailableCommands(ctx) {
    ctx.reply("Available commands:").then(function (_a) {
        var message_id = _a.message_id;
        ctx.reply("\n\n/skip\n/report\n\n/" + Object.keys(config.userConfig).join("\n/"));
    });
}
function saveLastRun(command) {
    postgres.client.query({
        text: "insert into last_run (command, last_run) VALUES ($1, $2) on conflict (command) do update set last_run = $2",
        values: [command, moment().valueOf()]
    }, function (err, res) {
        console.log(res);
        if (err) {
            console.log(err.stack);
        }
        else {
            console.log("Stored timestamp of last run for " + command);
        }
    });
}
function initBot() {
    console.log("Launching up Telegram bot...");
    bot.on(["document"], function (ctx) {
        // This is used to import other historic data
        var fileId = ctx.update.message.document.file_id;
        console.log("Received a file of ID " + fileId);
        // Format:
        //
        // Date;withingsFatMass;withingsLeanBodyMass;withingsMuscleMass
        // 28.05.2019;   6.9   ;   74.6  ,   71.1
        // 27.05.2019;   7.5   ;   74.1  ,   70.6
        // ....
        ctx.telegram.getFileLink(fileId).then(function (link) {
            console.log(link);
            needle.get(link, function (error, response, body) {
                if (error) {
                    console.error(error);
                    return;
                }
                body = body.toString(); // needed for some reason
                console.log(body);
                var sep = ";";
                var dateFormat = "DD.MM.YYYY";
                var lines = body.split("\n");
                var header = lines[0].split(sep);
                var counter = 0;
                for (var i = 1; i < lines.length; i++) {
                    var line = lines[i].split(sep);
                    if (line.length > 2) {
                        var date = moment(line[0].trim(), dateFormat);
                        for (var j = 1; j < line.length; j++) {
                            var value = line[j].trim();
                            var key = header[j].trim();
                            console.log(key + " for " + date.format() + " = " + value);
                            insertNewValue(value, null, key, "number", date);
                            counter++;
                            if (counter % 100 == 0) {
                                ctx.reply("Importing entry number " + counter);
                            }
                        }
                    }
                    else {
                        ctx.reply("The CSV file must use ; as a separator, must have at least 2 columns, with the first column being the date formatted DD.MM.YYYY, and all other columns using the key as the first row");
                    }
                }
                ctx.reply("✅ Succesfully imported " + counter + " rows");
            });
        });
    });
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
        if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
            console.error("Invalid user " + ctx.update.message.from.username);
            return;
        }
        console.log("user is skipping this question");
        ctx.reply("Okay, skipping question. If you see yourself skipping a question too often, maybe it's time to rephrase or remove it");
        triggerNextQuestionFromQueue(ctx);
    });
    bot.hears("/skip_all", function (ctx) {
        if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
            return;
        }
        currentlyAskedQuestionQueue = [];
        triggerNextQuestionFromQueue(ctx);
        ctx.reply("Okay, removing all questions that are currently in the queue");
    });
    bot.hears(/\/track (\w+)/, function (ctx) {
        if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
            console.error("Invalid user " + ctx.update.message.from.username);
            return;
        }
        var toTrack = ctx.match[1];
        console.log("User wants to track a specific value, without the whole survey: " +
            toTrack);
        var questionToAsk = null;
        Object.keys(config.userConfig).forEach(function (key) {
            var survey = config.userConfig[key];
            for (var i = 0; i < survey.questions.length; i++) {
                var currentQuestion = survey.questions[i];
                if (currentQuestion.key == toTrack) {
                    questionToAsk = currentQuestion;
                    return;
                }
            }
        });
        if (questionToAsk) {
            currentlyAskedQuestionQueue = currentlyAskedQuestionQueue.concat(questionToAsk);
            triggerNextQuestionFromQueue(ctx);
        }
        else {
            ctx.reply("Sorry, I couldn't find the key `" +
                toTrack +
                "`, please make sure it's not misspelled");
        }
    });
    bot.hears(/\/graph (\w+)/, function (ctx) {
        if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
            return;
        }
        var key = ctx.match[1];
        console.log("User wants to graph a specific value " + key);
        printGraph(key, ctx, 100, null, false);
    });
    bot.on("location", function (ctx) {
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
                return;
            }
            var result = body["results"][0];
            // we have some custom handling of the data here, as we get
            // so much useful data, that we want to insert more rows here
            insertNewValue(lat, ctx, "locationLat", "number");
            insertNewValue(lng, ctx, "locationLng", "number");
            insertNewValue(result["components"]["country"], ctx, "locationCountry", "text");
            insertNewValue(result["components"]["country_code"], ctx, "locationCountryCode", "text");
            insertNewValue(result["formatted"], ctx, "locationAddress", "text");
            insertNewValue(result["components"]["continent"], ctx, "locationContinent", "text");
            insertNewValue(result["annotations"]["currency"]["name"], ctx, "locationCurrency", "text");
            insertNewValue(result["annotations"]["timezone"]["short_name"], ctx, "timezone", "text");
            var city = result["components"]["city"] || result["components"]["state"]; // vienna is not a city according to their API
            insertNewValue(city, ctx, "locationCity", "text");
        });
        var today;
        var fromDate;
        if (moment().hours() < 18) {
            // this is being run after midnight,
            // as I have the tendency to stay up until later
            // we will fetch the weather from yesterday
            today = moment().subtract("1", "day");
            fromDate = moment().subtract("2", "day");
        }
        else {
            today = moment();
            fromDate = moment().subtract("1", "day");
        }
        var weatherURL = "http://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/weatherdata/history";
        var query = {
            location: lat + "," + lng,
            aggregateHours: "24",
            unitGroup: "metric",
            shortColumnNames: "false",
            key: process.env.WEATHER_API_KEY,
            contentType: "json",
            startDateTime: fromDate.format("YYYY-MM-DD") + "T00:00:00",
            endDateTime: today.format("YYYY-MM-DD") + "T00:00:00"
        };
        console.log(query);
        needle.request("get", weatherURL, query, function (error, response, body) {
            if (error) {
                console.error(error);
                return;
            }
            console.log(body);
            var result = Object.values(body["locations"])[0]["values"];
            console.log(result);
            if (result.length != 2) {
                console.error("Something is wrong here... should only have today and the day before");
            }
            var currentDay = result[1];
            var y = result[0];
            // https://www.visualcrossing.com/weather-data-documentation
            // Today
            insertNewValue(currentDay["temp"], ctx, "weatherCelsius", "number");
            insertNewValue(currentDay["maxt"], ctx, "weatherCelsiusMax", "number");
            insertNewValue(currentDay["mint"], ctx, "weatherCelsiusMin", "number");
            insertNewValue(currentDay["precip"], ctx, "weatherRain", "number");
            insertNewValue(currentDay["precipcover"], ctx, "weatherRainPercentageOfDay", "number");
            insertNewValue(currentDay["humidity"], ctx, "weatherHumidity", "number");
            insertNewValue(currentDay["snowdepth"], ctx, "weatherSnow", "number");
            // Yesterday
            insertNewValue(y["temp"], ctx, "weatherYesterdayCelsius", "number");
            insertNewValue(y["maxt"], ctx, "weatherYesterdayCelsiusMax", "number");
            insertNewValue(y["mint"], ctx, "weatherYesterdayCelsiusMin", "number");
            insertNewValue(y["precip"], ctx, "weatherYesterdayRain", "number");
            insertNewValue(y["precipcover"], ctx, "weatherYesterdayRainPercentageOfDay", "number");
            insertNewValue(y["humidity"], ctx, "weatherYesterdayHumidity", "number");
            insertNewValue(y["snowdepth"], ctx, "weatherYesterdaySnow", "number");
            triggerNextQuestionFromQueue(ctx);
        });
    });
    // parse commands to start a survey
    bot.hears(/\/(\w+)/, function (ctx) {
        if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
            return;
        }
        // user entered a command to start the survey
        var command = ctx.match[1];
        var matchingCommandObject = config.userConfig[command];
        if (matchingCommandObject && matchingCommandObject.questions) {
            console.log("User wants to run: " + command);
            saveLastRun(command);
            if (currentlyAskedQuestionQueue.length > 0 &&
                currentlyAskedQuestionMessageId) {
                // Happens when the user triggers another survey, without having completed the first one yet
                ctx.reply("^ Okay, but please answer my previous question also, thanks ^", Extra.inReplyTo(currentlyAskedQuestionMessageId));
            }
            currentlyAskedQuestionQueue = currentlyAskedQuestionQueue.concat(matchingCommandObject.questions.slice(0)); // slice is a poor human's .clone basically
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
    bot.on(["voice", "video_note"], function (ctx) {
        if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
            return;
        }
        var message = ctx.message || ctx.update.channel_post;
        var voice = message.voice || message.document || message.audio || message.video_note;
        var fileId = voice.file_id;
        var transcribingMessageId = null;
        console.log("Received voice with file ID '" + fileId + "'");
        ctx
            .reply("🦄 Received message, transcribing now...", Extra.inReplyTo(ctx.message.message_id))
            .then(function (_a) {
            var message_id = _a.message_id;
            transcribingMessageId = message_id;
        });
        var transcribeURL = "https://bubbles-transcribe.herokuapp.com/transcribe";
        transcribeURL += "?file_id=" + fileId;
        transcribeURL += "&language=en-US";
        transcribeURL += "&telegram_token=" + process.env.TELEGRAM_BOT_TOKEN;
        needle.get(transcribeURL, function (error, response, body) {
            if (error) {
                console.error(error);
                ctx.reply("Error: " + error, Extra.inReplyTo(ctx.message.message_id));
            }
            var text = JSON.parse(body)["text"];
            ctx.telegram.editMessageText(ctx.update.message.chat.id, transcribingMessageId, null, text);
            if (text != null && text.length > 5) {
                parseUserInput(ctx, text);
            }
        });
    });
    bot.help(function (ctx) {
        return ctx.reply("No in-bot help right now, for now please visit https://github.com/KrauseFx/FxLifeSheet");
    });
    bot.on("sticker", function (ctx) { return ctx.reply("Sorry, I don't support stickers"); });
    bot.hears("hi", function (ctx) { return ctx.reply("Hey there"); });
    // has to be last
    bot.launch();
}
