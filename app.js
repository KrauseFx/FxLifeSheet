var Telegraf = require("telegraf");
var bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.start(function (ctx) { return ctx.reply("Welcome!"); });
bot.help(function (ctx) { return ctx.reply("Send me a sticker"); });
bot.on("sticker", function (ctx) { return ctx.reply("👍"); });
bot.hears("hi", function (ctx) { return ctx.reply("Hey there"); });
bot.launch();
