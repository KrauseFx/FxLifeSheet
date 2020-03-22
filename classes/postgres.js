"use strict";
exports.__esModule = true;
var _a = require("pg"), Pool = _a.Pool, Client = _a.Client;
var connectionString = process.env.DATABASE_URL;
var pool = new Pool();
var client = new Client({
    connectionString: connectionString
});
client.connect();
console.log(client);
console.log("---------------Trying connection-----------------");
client.query("SELECT NOW()", function (err, res) {
    console.log(err, res);
    // client.end();
});
// module.exports.postgres = function() {
//   return client;
// };
// export {};
module.exports.client = client;
