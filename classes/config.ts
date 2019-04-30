// Interfaces
interface Command {
  description: String;
  schedule: String;
  questions: [QuestionToAsk];
}

interface QuestionToAsk {
  key: String;
  question: String;
  type: String;
  buttons: { [key: string]: String };
  replies: { [key: string]: String };
}

let userConfig: { [key: string]: Command } = require("../lifesheet.json");
console.log("Successfully loaded user config");

module.exports.userConfig = userConfig;
export { Command, QuestionToAsk };
