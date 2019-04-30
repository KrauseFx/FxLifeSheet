// Telegram setup
const Telegraf = require("telegraf");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

module.exports.bot = bot;
export {};
