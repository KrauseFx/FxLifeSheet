"use strict";
exports.__esModule = true;
// Telegram setup
var Telegraf = require("telegraf");
var bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
module.exports.bot = bot;
