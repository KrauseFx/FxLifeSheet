"use strict";
exports.__esModule = true;
var Client = require("pg").Client;
var connectionString = process.env.DATABASE_URL + "?ssl=true";
var client = new Client({
    connectionString: connectionString
});
client.connect();
console.log(client);
console.log("Successfully connected to Postgres");
client.query("SELECT NOW()", function (err, res) {
    console.log(err, res);
});
module.exports.client = client;
