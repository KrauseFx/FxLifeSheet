// Third party dependencies
var Moment = require("moment");
// Telegram setup
var Telegraf = require("telegraf");
var bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.start(function (ctx) { return ctx.reply("Welcome!"); });
bot.help(function (ctx) { return ctx.reply("Send me a sticker"); });
bot.on("sticker", function (ctx) { return ctx.reply("👍"); });
bot.hears("hi", function (ctx) { return ctx.reply("Hey there"); });
// Sheets setup
var GoogleSpreadsheet = require("google-spreadsheet");
var async = require("async");
// spreadsheet key is the long id in the sheets URL
console.log("Loading " + process.env.GOOGLE_SHEETS_SHEET_ID);
var doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_SHEET_ID);
var sheet;
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
        bot.hears(/(\d+)/, function (_a) {
            var match = _a.match, reply = _a.reply;
            var userValue = match[1];
            console.log("Got a new value: " + userValue);
            var dateToAdd = new Date(); // TODO: replace this with the date of the message
            var row = {
                Timestamp: dateToAdd,
                Year: dateToAdd.getFullYear(),
                Month: dateToAdd.getMonth() + 1,
                Day: dateToAdd.getDay(),
                Hour: dateToAdd.getHours(),
                Minute: dateToAdd.getMinutes(),
                Type: "Enough time for myself",
                Value: userValue
            };
            console.log(row);
            sheet.addRow(row, function (error, row) {
                reply("It's saved in the books for you");
            });
        });
        // has to be last
        bot.launch();
    }
});
