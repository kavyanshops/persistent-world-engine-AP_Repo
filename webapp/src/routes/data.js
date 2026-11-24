const router = require('express').Router();
const { query, pool } = require('../db');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { E } = require('../errors');
const { step } = require('../middleware/trace');
const { loadQueries } = require('../queries');
const users = require('../auth/users');
const audit = require('../audit');

const STATUSES = ['PLACED', 'ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_RESTAURANT'];
// Allowed order lifecycle. Anything else is a 409.
const NEXT = {
  PLACED: ['ACCEPTED', 'CANCELLED_BY_RESTAURANT'], ACCEPTED: ['PREPARING', 'CANCELLED_BY_RESTAURANT'],
  PREPARING: ['OUT_FOR_DELIVERY', 'CANCELLED_BY_RESTAURANT'], OUT_FOR_DELIVERY: ['DELIVERED'],
};
// Data-level authorization: a user with a cityId only sees their own city. null means "all cities".
const scopeOf = (req) => (req.user.cityId == null ? null : req.user.cityId);

// Everything below requires a valid token.
router.use(authenticate);

router.get('/overview', authorize('overview:read'), async (req, res, next) => {
  try {
    const city = scopeOf(req);
    const [row] = await query(`
      SELECT count(*) AS orders,
             count(*) FILTER (WHERE o.status = 'DELIVERED') AS delivered,
             count(*) FILTER (WHERE o.status IN ('PLACED','ACCEPTED','PREPARING')) AS attention,
             round(avg(EXTRACT(EPOCH FROM (o.delivered_at - o.placed_at)) / 60) FILTER (WHERE o.status = 'DELIVERED'), 1) AS avg_delivery_minutes,
             count(DISTINCT o.customer_id) AS customers, count(DISTINCT o.restaurant_id) AS restaurants
      FROM zomato.orders o
      JOIN zomato.restaurants r ON r.restaurant_id = o.restaurant_id
      JOIN zomato.localities l ON l.locality_id = r.locality_id
      WHERE ($1::int IS NULL OR l.city_id = $1)`, [city]);
    const [pay] = await query(`
      SELECT count(*) FILTER (WHERE p.payment_status = 'SUCCESS') AS successful, count(*) FILTER (WHERE p.payment_status = 'FAILED') AS failed
      FROM zomato.payments p JOIN zomato.orders o ON o.order_id = p.order_id
      JOIN zomato.restaurants r ON r.restaurant_id = o.restaurant_id JOIN zomato.localities l ON l.locality_id = r.locality_id
      WHERE ($1::int IS NULL OR l.city_id = $1)`, [city]);
    const [p] = await query(`SELECT count(*) AS active_partners FROM zomato.delivery_partners WHERE status = 'ACTIVE' AND ($1::int IS NULL OR city_id = $1)`, [city]);
    res.json({ scope: city == null ? 'all cities' : `city ${city}`, ...row, ...pay, ...p });
  } catch (e) { next(e); }
});

router.get('/orders', authorize('orders:read'),
  validate({ query: { limit: { type: 'int', min: 1, max: 50, default: 10 }, page: { type: 'int', min: 1, max: 100000, default: 1 }, status: { type: 'enum', values: STATUSES } } }),
  async (req, res, next) => {
    try {
      const { limit, page, status } = req.valid.query;
      const rows = await query(`
        SELECT o.order_id, o.status, o.total_amount, o.placed_at, c.full_name AS customer_name, r.name AS restaurant_name, l.city_id
        FROM zomato.orders o
        JOIN zomato.customers c ON c.customer_id = o.customer_id
        JOIN zomato.restaurants r ON r.restaurant_id = o.restaurant_id
        JOIN zomato.localities l ON l.locality_id = r.locality_id
        WHERE ($1::int IS NULL OR l.city_id = $1) AND ($2::text IS NULL OR o.status = $2)
        ORDER BY o.placed_at DESC, o.order_id DESC
        LIMIT $3 OFFSET $4`, [scopeOf(req), status || null, limit, (page - 1) * limit]);
      res.json({ page, limit, count: rows.length, data: rows });
    } catch (e) { next(e); }
  });

async function loadOrder(id) {
  const [o] = await query(`
    SELECT o.*, c.full_name AS customer_name, r.name AS restaurant_name, l.city_id, ci.city_name,
           (SELECT count(*) FROM zomato.order_items i WHERE i.order_id = o.order_id)::int AS item_count
    FROM zomato.orders o
    JOIN zomato.customers c ON c.customer_id = o.customer_id
    JOIN zomato.restaurants r ON r.restaurant_id = o.restaurant_id
    JOIN zomato.localities l ON l.locality_id = r.locality_id
    JOIN zomato.cities ci ON ci.city_id = l.city_id
    WHERE o.order_id = $1`, [id]);
  return o;
}

router.get('/orders/:id', authorize('orders:read'), validate({ params: { id: { type: 'int', min: 1 } } }), async (req, res, next) => {
  try {
    const o = await loadOrder(req.valid.params.id);
    if (!o) throw E.notFound('Order not found');
    const city = scopeOf(req);
    if (city != null && o.city_id !== city) { step(req, 'scope: 403 other city'); throw E.forbidden('This order is outside your city scope.'); }
    res.json(o);
  } catch (e) { next(e); }
});

router.patch('/orders/:id/status', authorize('orders:update'),
  validate({ params: { id: { type: 'int', min: 1 } }, body: { status: { type: 'enum', values: STATUSES, required: true } } }),
  async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { id } = req.valid.params, { status } = req.valid.body;
      await client.query('BEGIN');
      // Lock the row so two concurrent updates cannot both pass the lifecycle check.
      const { rows } = await client.query(`
        SELECT o.status, o.placed_at, o.accepted_at, l.city_id FROM zomato.orders o
        JOIN zomato.restaurants r ON r.restaurant_id = o.restaurant_id JOIN zomato.localities l ON l.locality_id = r.locality_id
        WHERE o.order_id = $1 FOR UPDATE OF o`, [id]);
      if (!rows[0]) throw E.notFound('Order not found');
      const city = scopeOf(req);
      if (city != null && rows[0].city_id !== city) { step(req, 'scope: 403 other city'); throw E.forbidden('This order is outside your city scope.'); }
      if (!(NEXT[rows[0].status] || []).includes(status)) {
        step(req, 'lifecycle: 409');
        throw E.conflict(`Cannot move an order from ${rows[0].status} to ${status}.`);
      }
      // Timestamp columns have CHECK constraints (accepted <= picked_up <= delivered), so set them consistently.
      const upd = await client.query(`
        UPDATE zomato.orders SET status = $2,
          accepted_at  = CASE WHEN $2 IN ('ACCEPTED','OUT_FOR_DELIVERY','DELIVERED') THEN COALESCE(accepted_at, GREATEST(now(), placed_at)) ELSE accepted_at END,
          picked_up_at = CASE WHEN $2 IN ('OUT_FOR_DELIVERY','DELIVERED') THEN COALESCE(picked_up_at, GREATEST(now(), COALESCE(accepted_at, placed_at))) ELSE picked_up_at END,
          delivered_at = CASE WHEN $2 = 'DELIVERED' THEN GREATEST(now(), COALESCE(picked_up_at, placed_at)) ELSE delivered_at END
        WHERE order_id = $1 RETURNING order_id, status, accepted_at, picked_up_at, delivered_at`, [id, status]);
      await client.query('COMMIT');
      step(req, `order ${id}: ${rows[0].status} -> ${status}`);
      res.json({ ...upd.rows[0], previousStatus: rows[0].status, changedBy: req.user.email });
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); } finally { client.release(); }
  });

router.get('/restaurants', authorize('restaurants:read'), async (req, res, next) => {
  try {
    res.json(await query(`
      SELECT r.restaurant_id, r.name, r.rating, r.rating_count, r.status, l.locality_name, ci.city_name,
             count(o.order_id) FILTER (WHERE o.status = 'DELIVERED') AS delivered_orders
      FROM zomato.restaurants r
      JOIN zomato.localities l ON l.locality_id = r.locality_id
      JOIN zomato.cities ci ON ci.city_id = l.city_id
      LEFT JOIN zomato.orders o ON o.restaurant_id = r.restaurant_id
      WHERE ($1::int IS NULL OR l.city_id = $1)
      GROUP BY r.restaurant_id, r.name, r.rating, r.rating_count, r.status, l.locality_name, ci.city_name
      ORDER BY delivered_orders DESC, r.rating DESC NULLS LAST LIMIT 6`, [scopeOf(req)]));
  } catch (e) { next(e); }
});

router.get('/schema', authorize('schema:read'), async (_req, res, next) => {
  try {
    res.json(await query(`
      SELECT c.relname AS table_name, c.reltuples::bigint AS approx_rows,
        (SELECT count(*) FROM information_schema.columns k WHERE k.table_schema = 'zomato' AND k.table_name = c.relname)::int AS columns,
        (SELECT count(*) FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'p')::int AS pk,
        (SELECT count(*) FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'f')::int AS fk,
        (SELECT count(*) FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'u')::int AS uniq,
        (SELECT count(*) FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'c')::int AS checks,
        (SELECT count(*) FROM pg_index i WHERE i.indrelid = c.oid)::int AS indexes,
        pg_size_pretty(pg_total_relation_size(c.oid)) AS size
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'zomato' AND c.relkind = 'r' ORDER BY c.relname`));
  } catch (e) { next(e); }
});

router.get('/queries', authorize('queries:read'), (_req, res, next) => { try { res.json(loadQueries()); } catch (e) { next(e); } });

// Admin only. Runs EXPLAIN ANALYZE for READ queries inside a read-only transaction that is always rolled back.
router.get('/explain/:id', authorize('explain:run'), validate({ params: { id: { type: 'string', min: 2, max: 6 } } }), async (req, res, next) => {
  const q = loadQueries().find((x) => x.id === req.valid.params.id);
  if (!q) return next(E.notFound('Unknown query id'));
  if (q.type !== 'READ') return next(E.badRequest('Live EXPLAIN is limited to READ queries.'));
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query('SET LOCAL search_path TO zomato');
    const r = await client.query(`EXPLAIN (ANALYZE, BUFFERS) ${q.sql.replace(/;\s*$/, '')}`);
    res.json({ id: q.id, plan: r.rows.map((row) => row['QUERY PLAN']) });
  } catch (e) { next(e); } finally { await client.query('ROLLBACK').catch(() => {}); client.release(); }
});

router.get('/admin/users', authorize('users:read'), (_req, res) => res.json(users.list()));
router.get('/admin/audit', authorize('audit:read'),
  validate({ query: { limit: { type: 'int', min: 1, max: 200, default: 50 }, security: { type: 'enum', values: ['true', 'false'], default: 'false' } } }),
  (req, res) => res.json(audit.list({ limit: req.valid.query.limit, securityOnly: req.valid.query.security === 'true' })));

module.exports = router;
