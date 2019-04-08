// Third party dependencies
var moment = require("moment");
var needle = require("needle");
// Telegram setup
var Telegraf = require("telegraf");
var Router = Telegraf.Router, Markup = Telegraf.Markup, Extra = Telegraf.Extra;
var bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
// Sheets setup
var GoogleSpreadsheet = require("google-spreadsheet");
var async = require("async");
// spreadsheet key is the long id in the sheets URL
console.log("Loading " + process.env.GOOGLE_SHEETS_SHEET_ID);
var doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_SHEET_ID);
var sheet;
// State
var currentlyAskedQuestionObject = null;
var currentlyAskedQuestionMessageId = null; // The Telegram message ID reference
var currentlyAskedQuestionQueue = []; // keep track of all the questions about to be asked
var userConfig = require("./config.json");
console.log("Loaded user config:");
console.log(userConfig);
async.series([
    function setAuth(step) {
        // var creds = {
        //   client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        //   private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY
        // };
        var creds = require("./credentials.json");
        doc.useServiceAccountAuth(creds, step);
    },
    function getInfoAndWorksheets(step) {
        doc.getInfo(function (err, info) {
            console.log("Loaded doc: " + info.title + " by " + info.author.email);
            sheet = info.worksheets[0];
            console.log("sheet 1: " +
                sheet.title +
                " " +
                sheet.rowCount +
                "x" +
                sheet.colCount);
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
    if (currentlyAskedQuestionObject.buttons &&
        currentlyAskedQuestionObject.buttons[number]) {
        return emojiNumber + " - " + currentlyAskedQuestionObject.buttons[number];
    }
    else {
        return number;
    }
}
function triggerNextQuestionFromQueue(ctx) {
    var currentQuestion = currentlyAskedQuestionQueue.shift();
    currentlyAskedQuestionObject = currentQuestion;
    if (currentQuestion == null) {
        ctx.reply("All done for now, let's do this 💪");
        // Finished
        return;
    }
    // Looks like Telegram has some limitations:
    // - No way to use `force_reply` together with a custom keyboard (https://github.com/KrauseFx/FxLifeSheet/issues/5)
    // - No way to update existing messages together with a custom keyboard https://core.telegram.org/bots/api#updating-messages
    var keyboard = null;
    if (currentQuestion.type == "range") {
        keyboard = Markup.keyboard([
            [getButtonText("5"), getButtonText("4")],
            [getButtonText("3"), getButtonText("2")],
            [getButtonText("1"), getButtonText("0")]
        ])
            .oneTime()
            .extra();
    }
    else {
        // TODO: reset keyboard here
    }
    var question = currentQuestion.question +
        " (" +
        currentlyAskedQuestionQueue.length +
        " more)";
    ctx.reply(question, keyboard).then(function (_a) {
        var message_id = _a.message_id;
        currentlyAskedQuestionMessageId = message_id;
    });
}
// App logic
function initBot() {
    bot.hears(/(\d+)/, function (ctx) {
        if (currentlyAskedQuestionMessageId == null) {
            ctx.reply("Sorry, I forgot the question I asked, this usually means it took too long for you to respond, please trigger the question again by running the `/` command");
            return;
        }
        // user replied with a value
        var userValue = ctx.match[1];
        console.log("Got a new value: " +
            userValue +
            " for question " +
            currentlyAskedQuestionObject.key);
        if (currentlyAskedQuestionObject.replies &&
            currentlyAskedQuestionObject.replies[userValue]) {
            // Check if there is a custom reply, and if, use that
            ctx.reply(currentlyAskedQuestionObject.replies[userValue], Extra.inReplyTo(ctx.update.message.message_id));
        }
        var dateToAdd = moment();
        var row = {
            Timestamp: dateToAdd.format(),
            Year: dateToAdd.year(),
            Month: dateToAdd.month() + 1,
            Day: dateToAdd.date(),
            Hour: dateToAdd.hours(),
            Minute: dateToAdd.minutes(),
            Week: dateToAdd.week(),
            Quarter: dateToAdd.quarter(),
            Type: currentlyAskedQuestionObject.key,
            Value: userValue
        };
        sheet.addRow(row, function (error, row) {
            // TODO: replace with editing the existing message (ID in currentlyAskedQuestionMessageId, however couldn't get it to work)
            // ctx.reply("Success ✅", Extra.inReplyTo(currentlyAskedQuestionMessageId));
        });
        triggerNextQuestionFromQueue(ctx);
    });
    // As we get no benefit of using `bot.command` to add commands, we might as well use
    // regexes, which then allows us to let the user's JSON define the available commands
    bot.hears("/report", function (_a) {
        var replyWithPhoto = _a.replyWithPhoto;
        console.log("Generating report...");
        replyWithPhoto({
            url: "https://datastudio.google.com/reporting/1a-1rVk-4ZFOg0WTNNGRvJDXMTNXpl5Uy/page/MpTm/thumbnail?sz=s3000"
        }).then(function (_a) {
            var message_id = _a.message_id;
            console.log("Success");
        });
    });
    bot.hears(/\/(\w+)/, function (ctx) {
        console.log(ctx);
        // user entered a command to start the survey
        var command = ctx.match[1];
        var matchingCommandObject = userConfig[command];
        if (matchingCommandObject && matchingCommandObject.values) {
            console.log("User wants to run:");
            console.log(matchingCommandObject);
            currentlyAskedQuestionQueue = currentlyAskedQuestionQueue.concat(matchingCommandObject.values.slice(0)); // slice is a poor human's .clone basically
            if (currentlyAskedQuestionObject == null) {
                triggerNextQuestionFromQueue(ctx);
            }
        }
    });
    bot.start(function (ctx) { return ctx.reply("Welcome to FxLifeSheet"); });
    bot.help(function (ctx) { return ctx.reply("TODO: This will include the help section"); });
    bot.on("sticker", function (ctx) { return ctx.reply("Sorry, I don't support stickers"); });
    bot.hears("hi", function (ctx) { return ctx.reply("Hey there"); });
    // has to be last
    bot.launch();
}
