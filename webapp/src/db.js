const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'zomato_ap',
  user: process.env.PGUSER || process.env.USER || require('node:os').userInfo().username,
  password: process.env.PGPASSWORD,
});

const query = async (text, values = []) => (await pool.query(text, values)).rows;
module.exports = { pool, query };
