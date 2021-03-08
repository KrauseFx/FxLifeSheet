const { Pool, Client } = require("pg");
const connectionString = process.env.DATABASE_URL + "&ssl=true";
const pool = new Pool();

const client = new Client({
  connectionString: connectionString
});
client.connect();

console.log(client);
console.log("Successfully connected to Postgres");

client.query("SELECT NOW()", (err, res) => {
  console.log(err, res);
});

module.exports.client = client;
export {};
