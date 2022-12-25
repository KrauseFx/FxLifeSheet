"use strict";
exports.__esModule = true;
var Client = require("pg").Client;
var connectionString = process.env.DATABASE_URL;
var client = new Client({
    connectionString: connectionString
});
client.connect(function (err, client, done) {
    console.log(err);
    console.log(done);
});
console.log("Successfully connected to Postgres");
client.query("SELECT NOW()", function (err, res) {
    console.log(err, res);
});
module.exports.client = client;
//# sourceMappingURL=postgres.js.map