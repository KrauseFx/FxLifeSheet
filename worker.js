"use strict";
exports.__esModule = true;
var moment = require("moment");
var needle = require("needle");
var _a = require("telegraf"), Router = _a.Router, Markup = _a.Markup, Extra = _a.Extra;
var config = require("./classes/config.js");
var postgres = require("./classes/postgres.js");
var telegram = require("./classes/telegram.js");
var bot = telegram.bot;
var currentlyAskedQuestionObject = null;
var currentlyAskedQuestionMessageId = null;
var currentlyAskedQuestionQueue = [];
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
        if (numberOfRecentValuesToPrint > 0) {
            ctx.reply(rawText.join("\n") + "\nMinimum: " + minimum + "\nMaximum: " + maximum);
        }
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
    var keyboard = Extra.markup(function (m) { return m.removeKeyboard(); });
    var questionAppendix = "";
    currentlyAskedQuestionObject = currentlyAskedQuestionQueue.shift();
    if (currentlyAskedQuestionObject == null) {
        ctx.reply("All done for now, let's do this 💪", keyboard);
        return;
    }
    if (currentlyAskedQuestionObject.question == null) {
        console.error("No text defined for");
        console.error(currentlyAskedQuestionObject);
    }
    if (currentlyAskedQuestionObject.type == "header") {
        ctx
            .reply(currentlyAskedQuestionObject.question, keyboard)
            .then(function (_a) {
            var message_id = _a.message_id;
            triggerNextQuestionFromQueue(ctx);
        });
        return;
    }
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
        printGraph(currentlyAskedQuestionObject.key, ctx, 0, null, false);
    }
}
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
        Value: parsedUserValue,
        Source: "telegram"
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
    var userValue;
    if (text != null) {
        userValue = text;
    }
    else {
        userValue = ctx.match[1];
    }
    var parsedUserValue = null;
    if (currentlyAskedQuestionObject.type != "text") {
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
            userValue = userValue.match(/^(\d+(\.\d+)?)$/);
            if (userValue == null) {
                ctx.reply("Sorry, looks like you entered an invalid number, please try again", Extra.inReplyTo(ctx.update.message.message_id));
                return;
            }
            parsedUserValue = userValue[1];
        }
    }
    else {
        parsedUserValue = userValue;
    }
    if (currentlyAskedQuestionObject.type == "range") {
        if (parsedUserValue < 0 || parsedUserValue > 6) {
            ctx.reply("Please enter a value from 0 to 6", Extra.inReplyTo(ctx.update.message.message_id));
            return;
        }
    }
    if (currentlyAskedQuestionObject.type == "number" ||
        currentlyAskedQuestionObject.type == "range" ||
        currentlyAskedQuestionObject.type == "boolean") {
        printGraph(currentlyAskedQuestionObject.key, ctx, 5, parsedUserValue, true);
    }
    console.log("Got a new value: " +
        parsedUserValue +
        " for question " +
        currentlyAskedQuestionObject.key);
    if (currentlyAskedQuestionObject.replies &&
        currentlyAskedQuestionObject.replies[parsedUserValue]) {
        ctx.reply(currentlyAskedQuestionObject.replies[parsedUserValue], Extra.inReplyTo(ctx.update.message.message_id));
    }
    insertNewValue(parsedUserValue, ctx, currentlyAskedQuestionObject.key, currentlyAskedQuestionObject.type);
    setTimeout(function () {
        triggerNextQuestionFromQueue(ctx);
    }, 50);
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
        var fileId = ctx.update.message.document.file_id;
        console.log("Received a file of ID " + fileId);
        ctx.telegram.getFileLink(fileId).then(function (link) {
            console.log(link);
            needle.get(link, function (error, response, body) {
                if (error) {
                    console.error(error);
                    return;
                }
                body = body.toString();
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
                            if (value.length > 0) {
                                insertNewValue(value, null, key, "number", date);
                                counter++;
                                if (counter % 100 == 0) {
                                    ctx.reply("Importing entry number " + counter);
                                }
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
    bot.hears(/^([^\/].*)$/, function (ctx) {
        parseUserInput(ctx);
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
                "`, please make sure it's not mispelled");
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
        insertNewValue(lat, ctx, "locationLat", "number");
        insertNewValue(lng, ctx, "locationLng", "number");
        triggerNextQuestionFromQueue(ctx);
        return;
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
            insertNewValue(result["components"]["country"], ctx, "locationCountry", "text");
            insertNewValue(result["components"]["country_code"], ctx, "locationCountryCode", "text");
            insertNewValue(result["formatted"], ctx, "locationAddress", "text");
            insertNewValue(result["components"]["continent"], ctx, "locationContinent", "text");
            insertNewValue(result["annotations"]["currency"]["name"], ctx, "locationCurrency", "text");
            insertNewValue(result["annotations"]["timezone"]["short_name"], ctx, "timezone", "text");
            var city = result["components"]["city"] || result["components"]["state"];
            insertNewValue(city, ctx, "locationCity", "text");
        });
        var today;
        var fromDate;
        if (moment().hours() < 18) {
            today = moment().subtract("1", "day");
            fromDate = moment().subtract("2", "day");
        }
        else {
            today = moment();
            fromDate = moment().subtract("1", "day");
        }
    });
    bot.hears(/\/(\w+)/, function (ctx) {
        if (ctx.update.message.from.username != process.env.TELEGRAM_USER_ID) {
            return;
        }
        var command = ctx.match[1];
        var matchingCommandObject = config.userConfig[command];
        if (matchingCommandObject && matchingCommandObject.questions) {
            console.log("User wants to run: " + command);
            saveLastRun(command);
            if (currentlyAskedQuestionQueue.length > 0 &&
                currentlyAskedQuestionMessageId) {
                ctx.reply("^ Okay, but please answer my previous question also, thanks ^", Extra.inReplyTo(currentlyAskedQuestionMessageId));
            }
            currentlyAskedQuestionQueue = currentlyAskedQuestionQueue.concat(matchingCommandObject.questions.slice(0));
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
    bot.launch();
}
//# sourceMappingURL=worker.js.map