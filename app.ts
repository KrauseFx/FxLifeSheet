// Third party dependencies
const Moment = require("moment");

// Telegram setup
const Telegraf = require("telegraf");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.start(ctx => ctx.reply("Welcome!"));
bot.help(ctx => ctx.reply("Send me a sticker"));
bot.on("sticker", ctx => ctx.reply("👍"));
bot.hears("hi", ctx => ctx.reply("Hey there"));

// Sheets setup
var GoogleSpreadsheet = require("google-spreadsheet");
var async = require("async");

// spreadsheet key is the long id in the sheets URL
console.log("Loading " + process.env.GOOGLE_SHEETS_SHEET_ID);
var doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_SHEET_ID);
var sheet;

async.series(
  [
    function setAuth(step) {
      // var creds = {
      //   client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      //   private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY
      // };
      var creds = require("./credentials.json");

      doc.useServiceAccountAuth(creds, step);
    },
    function getInfoAndWorksheets(step) {
      doc.getInfo(function(err, info) {
        console.log("Loaded doc: " + info.title + " by " + info.author.email);
        sheet = info.worksheets[0];
        console.log(
          "sheet 1: " +
            sheet.title +
            " " +
            sheet.rowCount +
            "x" +
            sheet.colCount
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
    }
  }
);

// App logic
function initBot() {
  bot.hears(/(\d+)/, ({ match, reply }) => {
    let userValue = match[1];
    console.log("Got a new value: " + userValue);
    let dateToAdd = new Date(); // TODO: replace this with the date of the message
    let row = {
      Timestamp: dateToAdd.toLocaleString(),
      Year: dateToAdd.getFullYear(),
      Month: dateToAdd.getMonth() + 1,
      Day: dateToAdd.getDay(),
      Hour: dateToAdd.getHours(),
      Minute: dateToAdd.getMinutes(),
      Type: "Enough time for myself",
      Value: userValue
    };
    console.log(row);

    sheet.addRow(row, function(error, row) {
      reply("It's saved in the books for you");
    });
  });

  // has to be last
  bot.launch();
}
