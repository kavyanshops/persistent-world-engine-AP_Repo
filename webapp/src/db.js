const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const sslEnabled =
  process.env.DATABASE_SSL === 'true' ||
  process.env.PGSSLMODE === 'require' ||
  Boolean(connectionString && !/(?:localhost|127\.0\.0\.1)/i.test(connectionString));

const pool = new Pool({
  connectionString,
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'zomato_ap',
  user: process.env.PGUSER || process.env.USER || require('node:os').userInfo().username,
  password: process.env.PGPASSWORD,
  ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
});

const query = async (text, values = []) => (await pool.query(text, values)).rows;
module.exports = { pool, query };
