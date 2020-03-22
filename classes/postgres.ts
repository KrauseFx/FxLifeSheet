const { Pool, Client } = require("pg");
const connectionString = process.env.DATABASE_URL;
const pool = new Pool();

const client = new Client({
  connectionString: connectionString
});
client.connect();

console.log(client);
console.log("---------------Trying connection-----------------");

client.query("SELECT NOW()", (err, res) => {
  console.log(err, res);
  // client.end();
});

// module.exports.postgres = function() {
//   return client;
// };
// export {};

module.exports.client = client;
export {};
