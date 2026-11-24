// Run: npm test   (needs the zomato_ap database; uses real HTTP against the real app)
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.LOG = 'silent';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { pool, query } = require('../src/db');

let base, server;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const call = async (method, path, { token, body, headers = {}, raw } = {}) => {
  const res = await fetch(base + path, { method, headers: { ...(body !== undefined || raw ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, json };
};
const login = async (email, password) => (await call('POST', '/api/auth/login', { body: { email, password } })).json?.token;
const T = {};

test.before(async () => {
  server = app.listen(0); base = `http://127.0.0.1:${server.address().port}`;
  T.admin = await login('admin@zomato.test', 'Admin@12345');
  T.manager = await login('manager.blr@zomato.test', 'Manager@12345');
  T.analyst = await login('analyst@zomato.test', 'Analyst@12345');
});
test.after(async () => { server.close(); await pool.end(); });

test('public: health is open, headers are hardened, framework is hidden', async () => {
  const r = await call('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.ok(r.headers.get('x-request-id'));
  assert.match(r.headers.get('x-middleware-trace'), /requestId > securityHeaders/);
});

test('request id from the client is echoed, junk ids are replaced', async () => {
  assert.equal((await call('GET', '/api/health', { headers: { 'x-request-id': 'my-trace-id-12345' } })).headers.get('x-request-id'), 'my-trace-id-12345');
  assert.notEqual((await call('GET', '/api/health', { headers: { 'x-request-id': '<script>' } })).headers.get('x-request-id'), '<script>');
});

test('401: missing, malformed and garbage tokens are rejected', async () => {
  let r = await call('GET', '/api/orders');
  assert.equal(r.status, 401); assert.equal(r.json.error.code, 'TOKEN_MISSING'); assert.match(r.headers.get('www-authenticate'), /Bearer/);
  r = await call('GET', '/api/orders', { headers: { authorization: 'Basic abc' } });
  assert.equal(r.status, 401); assert.equal(r.json.error.code, 'TOKEN_MALFORMED');
  r = await call('GET', '/api/orders', { token: 'not.a.jwt' });
  assert.equal(r.status, 401); assert.equal(r.json.error.code, 'TOKEN_INVALID');
});

test('401: forged tokens fail (alg=none, edited payload, wrong secret, wrong audience, expired)', async () => {
  const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: '1', iss: 'zomato-ops-api', aud: 'zomato-ops-dashboard', exp: 9999999999 })}.`;
  assert.equal((await call('GET', '/api/orders', { token: none })).status, 401);
  const [h, , s] = T.analyst.split('.');
  const edited = `${h}.${b64({ sub: '1', iss: 'zomato-ops-api', aud: 'zomato-ops-dashboard', exp: 9999999999 })}.${s}`;
  assert.equal((await call('GET', '/api/admin/users', { token: edited })).status, 401);
  const wrongSecret = jwt.sign({}, 'attacker-secret', { subject: '1', issuer: 'zomato-ops-api', audience: 'zomato-ops-dashboard', expiresIn: 600 });
  assert.equal((await call('GET', '/api/orders', { token: wrongSecret })).status, 401);
  const wrongAud = jwt.sign({}, process.env.JWT_SECRET, { subject: '1', issuer: 'zomato-ops-api', audience: 'other-app', expiresIn: 600 });
  assert.equal((await call('GET', '/api/orders', { token: wrongAud })).status, 401);
  const expired = jwt.sign({ exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET, { subject: '1', issuer: 'zomato-ops-api', audience: 'zomato-ops-dashboard' });
  const r = await call('GET', '/api/orders', { token: expired });
  assert.equal(r.status, 401); assert.equal(r.json.error.code, 'TOKEN_EXPIRED');
  const hs512 = jwt.sign({}, process.env.JWT_SECRET, { algorithm: 'HS512', subject: '1', issuer: 'zomato-ops-api', audience: 'zomato-ops-dashboard', expiresIn: 600 });
  assert.equal((await call('GET', '/api/orders', { token: hs512 })).status, 401, 'only the pinned algorithm is accepted');
});

test('login: same error for unknown user and wrong password, no hash leaks, validation works', async () => {
  const a = await call('POST', '/api/auth/login', { body: { email: 'nobody@zomato.test', password: 'x' } });
  const b = await call('POST', '/api/auth/login', { body: { email: 'admin@zomato.test', password: 'wrong' } });
  assert.equal(a.status, 401); assert.equal(b.status, 401);
  assert.equal(a.json.error.message, b.json.error.message);
  const ok = await call('POST', '/api/auth/login', { body: { email: 'ADMIN@zomato.test', password: 'Admin@12345' } });
  assert.equal(ok.status, 200); assert.equal(ok.json.tokenType, 'Bearer'); assert.equal(ok.json.user.role, 'admin');
  assert.ok(!JSON.stringify(ok.json).includes('passwordHash'));
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'bad' } })).status, 400);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'a@b.co', password: 'x', isAdmin: true } })).status, 400);
});

test('403: roles decide what a valid user may do', async () => {
  assert.equal((await call('GET', '/api/orders', { token: T.analyst })).status, 200);
  let r = await call('PATCH', '/api/orders/1/status', { token: T.analyst, body: { status: 'ACCEPTED' } });
  assert.equal(r.status, 403); assert.equal(r.json.error.code, 'FORBIDDEN');
  assert.equal((await call('GET', '/api/schema', { token: T.analyst })).status, 200);
  assert.equal((await call('GET', '/api/schema', { token: T.manager })).status, 403);
  assert.equal((await call('GET', '/api/explain/R1', { token: T.analyst })).status, 403);
  assert.equal((await call('GET', '/api/admin/audit', { token: T.manager })).status, 403);
  assert.equal((await call('GET', '/api/admin/users', { token: T.admin })).status, 200);
  assert.equal((await call('GET', '/api/explain/R1', { token: T.admin })).status, 200);
});

test('data scope: a manager only sees and changes their own city', async () => {
  const list = await call('GET', '/api/orders?limit=50', { token: T.manager });
  assert.equal(list.status, 200); assert.ok(list.json.data.length > 0);
  assert.ok(list.json.data.every((o) => o.city_id === 1));
  const [other] = await query(`SELECT o.order_id FROM zomato.orders o JOIN zomato.restaurants r USING (restaurant_id) JOIN zomato.localities l USING (locality_id) WHERE l.city_id <> 1 LIMIT 1`);
  assert.equal((await call('GET', `/api/orders/${other.order_id}`, { token: T.manager })).status, 403);
  assert.equal((await call('PATCH', `/api/orders/${other.order_id}/status`, { token: T.manager, body: { status: 'CANCELLED_BY_RESTAURANT' } })).status, 403);
  assert.equal((await call('GET', `/api/orders/${other.order_id}`, { token: T.admin })).status, 200);
  const mo = (await call('GET', '/api/overview', { token: T.manager })).json, ao = (await call('GET', '/api/overview', { token: T.admin })).json;
  assert.ok(Number(mo.orders) < Number(ao.orders));
});

test('400: validation rejects bad params, query, body and injection attempts', async () => {
  const t = T.admin;
  for (const p of ['limit=abc', 'limit=0', 'limit=1000', 'page=-1', 'status=BOGUS', "status=' OR 1=1--", 'status=PLACED;DROP TABLE zomato.orders'])
    assert.equal((await call('GET', `/api/orders?${p}`, { token: t })).status, 400, p);
  assert.equal((await call('GET', '/api/orders/abc', { token: t })).status, 400);
  assert.equal((await call('GET', '/api/orders/1;DROP', { token: t })).status, 400);
  assert.equal((await call('PATCH', '/api/orders/1/status', { token: t, body: {} })).status, 400);
  assert.equal((await call('PATCH', '/api/orders/1/status', { token: t, body: { status: 'SHIPPED' } })).status, 400);
  const extra = await call('PATCH', '/api/orders/1/status', { token: t, body: { status: 'ACCEPTED', total_amount: 0 } });
  assert.equal(extra.status, 400); assert.equal(extra.json.error.details[0].field, 'total_amount');
  assert.equal((await call('PATCH', '/api/orders/1/status', { token: t, raw: '{bad json' })).status, 400);
  assert.equal((await call('PATCH', '/api/orders/1/status', { token: t, raw: JSON.stringify({ status: 'x'.repeat(20000) }) })).status, 413);
  assert.equal((await query('SELECT count(*)::int AS n FROM zomato.orders'))[0].n, 150000, 'orders table is intact');
});

test('404 and 409: unknown things and illegal lifecycle moves', async () => {
  assert.equal((await call('GET', '/api/orders/999999999', { token: T.admin })).status, 404);
  assert.equal((await call('GET', '/api/nope', { token: T.admin })).status, 404);
  assert.equal((await call('GET', '/api/explain/ZZ99', { token: T.admin })).status, 404);
  const [d] = await query(`SELECT order_id FROM zomato.orders WHERE status = 'DELIVERED' LIMIT 1`);
  const r = await call('PATCH', `/api/orders/${d.order_id}/status`, { token: T.admin, body: { status: 'PLACED' } });
  assert.equal(r.status, 409); assert.equal(r.json.error.code, 'CONFLICT');
});

test('200: a legal status change works end to end and is restorable', async () => {
  const [o] = await query(`SELECT order_id FROM zomato.orders WHERE status = 'PLACED' ORDER BY order_id DESC LIMIT 1`);
  try {
    const r = await call('PATCH', `/api/orders/${o.order_id}/status`, { token: T.admin, body: { status: 'ACCEPTED' } });
    assert.equal(r.status, 200); assert.equal(r.json.status, 'ACCEPTED'); assert.equal(r.json.previousStatus, 'PLACED'); assert.ok(r.json.accepted_at);
    assert.equal((await call('PATCH', `/api/orders/${o.order_id}/status`, { token: T.admin, body: { status: 'DELIVERED' } })).status, 409, 'cannot skip steps');
  } finally { await query(`UPDATE zomato.orders SET status='PLACED', accepted_at=NULL WHERE order_id=$1`, [o.order_id]); }
});

test('logout revokes the token', async () => {
  const t = await login('analyst@zomato.test', 'Analyst@12345');
  assert.equal((await call('GET', '/api/auth/me', { token: t })).status, 200);
  assert.equal((await call('POST', '/api/auth/logout', { token: t })).status, 204);
  const r = await call('GET', '/api/auth/me', { token: t });
  assert.equal(r.status, 401); assert.equal(r.json.error.code, 'TOKEN_REVOKED');
});

test('429: brute-force login is throttled per account, other accounts are unaffected', async () => {
  const bad = () => call('POST', '/api/auth/login', { body: { email: 'brute@zomato.test', password: 'guess' } });
  const codes = []; for (let i = 0; i < 7; i++) codes.push((await bad()).status);
  assert.deepEqual(codes, [401, 401, 401, 401, 401, 429, 429]);
  const r = await bad(); assert.ok(Number(r.headers.get('retry-after')) > 0); assert.equal(r.json.error.code, 'RATE_LIMITED');
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'admin@zomato.test', password: 'Admin@12345' } })).status, 200);
});

test('audit log records security events with user and request id', async () => {
  const r = await call('GET', '/api/admin/audit?security=true&limit=20', { token: T.admin });
  assert.equal(r.status, 200); assert.ok(r.json.length > 0);
  assert.ok(r.json.every((e) => [401, 403, 429].includes(e.status)));
  assert.ok(r.json.every((e) => e.requestId));
});
