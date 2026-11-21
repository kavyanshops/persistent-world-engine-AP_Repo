const path = require('node:path');
const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'zomato_ap',
  user: process.env.PGUSER || process.env.USER,
  password: process.env.PGPASSWORD,
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function query(text, values = []) {
  const result = await pool.query(text, values);
  return result.rows;
}

app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

app.get('/api/overview', async (_req, res, next) => {
  try {
    const [counts, delivery, payments] = await Promise.all([
      query(`
        SELECT
          (SELECT count(*) FROM zomato.orders) AS orders,
          (SELECT count(*) FROM zomato.customers) AS customers,
          (SELECT count(*) FROM zomato.restaurants) AS restaurants,
          (SELECT count(*) FROM zomato.delivery_partners WHERE status = 'ACTIVE') AS active_partners
      `),
      query(`
        SELECT
          count(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
          count(*) FILTER (WHERE status IN ('PLACED', 'ACCEPTED', 'PREPARING')) AS attention,
          round(avg(EXTRACT(EPOCH FROM (delivered_at - placed_at)) / 60) FILTER (WHERE status = 'DELIVERED'), 1) AS avg_delivery_minutes
        FROM zomato.orders
      `),
      query(`
        SELECT
          count(*) FILTER (WHERE payment_status = 'FAILED') AS failed,
          count(*) FILTER (WHERE payment_status = 'SUCCESS') AS successful
        FROM zomato.payments
      `),
    ]);
    res.json({ ...counts[0], ...delivery[0], ...payments[0] });
  } catch (error) {
    next(error);
  }
});

app.get('/api/orders', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 25);
    const rows = await query(`
      SELECT o.order_id, o.status, o.total_amount, o.placed_at,
             c.full_name AS customer_name, r.name AS restaurant_name,
             l.city_id
      FROM zomato.orders o
      JOIN zomato.customers c ON c.customer_id = o.customer_id
      JOIN zomato.restaurants r ON r.restaurant_id = o.restaurant_id
      JOIN zomato.localities l ON l.locality_id = r.locality_id
      ORDER BY o.placed_at DESC, o.order_id DESC
      LIMIT $1
    `, [limit]);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/restaurants', async (_req, res, next) => {
  try {
    const rows = await query(`
      SELECT r.restaurant_id, r.name, r.rating, r.rating_count, r.status,
             l.locality_name, ci.city_name,
             count(o.order_id) FILTER (WHERE o.status = 'DELIVERED') AS delivered_orders
      FROM zomato.restaurants r
      JOIN zomato.localities l ON l.locality_id = r.locality_id
      JOIN zomato.cities ci ON ci.city_id = l.city_id
      LEFT JOIN zomato.orders o ON o.restaurant_id = r.restaurant_id
      GROUP BY r.restaurant_id, r.name, r.rating, r.rating_count, r.status,
               l.locality_name, ci.city_name
      ORDER BY delivered_orders DESC, r.rating DESC NULLS LAST
      LIMIT 6
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Unable to load dashboard data.' });
});

app.listen(port, () => {
  console.log(`Zomato Ops dashboard running at http://localhost:${port}`);
});
