const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => Number(v || 0).toLocaleString('en-IN');
const inr = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const ms = (v) => (v < 1 ? v.toFixed(3) : v.toFixed(2));
const stat = (s) => `<span class="st ${esc(s.toLowerCase())}">${esc(s.replaceAll('_', ' '))}</span>`;
const b64u = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const unb64u = (s) => JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/')));
let queries = [], filter = 'ALL', current = null, rbac = null;

/* ---------- session (sessionStorage: cleared when the tab closes) ---------- */
let auth = null;
try { auth = JSON.parse(sessionStorage.getItem('auth') || 'null'); } catch { auth = null; }
const saveAuth = () => { try { auth ? sessionStorage.setItem('auth', JSON.stringify(auth)) : sessionStorage.removeItem('auth'); } catch {} };

/* ---------- HTTP ---------- */
function redactConsoleValue(value) {
  if (typeof value === 'string') {
    try { return redactConsoleValue(JSON.parse(value)); } catch { return value; }
  }
  if (Array.isArray(value)) return value.map(redactConsoleValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      /(password|token|secret|authorization|cookie)/i.test(key) ? '[REDACTED]' : redactConsoleValue(entry)
    ]));
  }
  return value;
}

/* ---------- observable HTTP client: every browser API call is visible in DevTools ---------- */
async function raw(method, path, { token, body, rawBody } = {}) {
  const headers = {};
  if (token) headers.authorization = 'Bearer ' + token;
  if (body !== undefined || rawBody !== undefined) headers['content-type'] = 'application/json';
  const requestId = (globalThis.crypto?.randomUUID?.() || ('demo-' + Date.now() + '-' + Math.random().toString(16).slice(2))).replace(/[^\w-]/g, '');
  headers['x-request-id'] = requestId;
  const started = performance.now();
  const payload = rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined);
  console.groupCollapsed(`%c[API →] ${method} ${path}`, 'color:#287a55;font-weight:bold');
  console.log('Request ID:', requestId);
  console.log('Authorization:', token ? 'Bearer token attached' : 'No bearer token');
  if (payload !== undefined) console.log('Request body:', redactConsoleValue(payload));
  let res, text, json;
  try {
    res = await fetch(path, { method, headers, body: payload });
    text = await res.text();
    json = null; try { json = JSON.parse(text); } catch {}
  } catch (error) {
    console.error('[NETWORK ERROR]', error);
    console.groupEnd();
    throw error;
  }
  const elapsed = performance.now() - started;
  const trace = res.headers.get('x-middleware-trace') || '(trace header unavailable)';
  const responseHeaders = Object.fromEntries(['x-request-id','x-middleware-trace','x-ratelimit-limit','x-ratelimit-remaining','retry-after','www-authenticate','content-security-policy','x-content-type-options','x-frame-options','cache-control'].map(k => [k, res.headers.get(k)]).filter(([,v]) => v));
  const result = { status: res.status, ms: elapsed, headers: res.headers, json, text, requestId, trace };
  const methodStyle = res.ok ? 'color:#287a55;font-weight:bold' : 'color:#b3443b;font-weight:bold';
  console.log(`%c[API ←] ${res.status} ${res.statusText} · ${elapsed.toFixed(1)} ms`, methodStyle);
  console.log('Middleware trace:', trace);
  console.log('Response headers:', responseHeaders);
  console.log('Response body:', redactConsoleValue(json ?? text));
  console.groupEnd();
  window.dispatchEvent(new CustomEvent('api:complete', { detail: { method, path, status: res.status, ms: elapsed, requestId, trace } }));
  return result;
}
async function api(path, opts = {}) {
  const r = await raw(opts.method || 'GET', path, { token: auth && auth.token, body: opts.body, rawBody: opts.rawBody });
  if (r.status === 401 && auth) { signOutLocal('Session ended: ' + (r.json?.error?.message || 'please sign in again.')); }
  if (r.status >= 400) { const e = new Error(r.json?.error?.message || 'Request failed'); e.status = r.status; e.response = r; throw e; }
  return r.json;
}
const can = (p) => !!(auth && auth.user.permissions.includes(p));

window.addEventListener('api:complete', (event) => {
  const { method, path, status, ms: elapsed, requestId, trace } = event.detail;
  const list = $('#activityList'); if (!list) return;
  if (list.querySelector('.note')) list.innerHTML = '';
  const row = document.createElement('div'); row.className = 'activity-row';
  const ok = status >= 200 && status < 300;
  row.innerHTML = `<span class="activity-method ${method.toLowerCase()}">${esc(method)}</span><span class="activity-path">${esc(path)}</span><b class="activity-status ${ok ? 'good' : 'bad'}">${status}</b><span class="activity-time">${Number(elapsed).toFixed(1)} ms</span><span class="activity-id" title="${esc(requestId)}">${esc(requestId.slice(0,8))}</span>`;
  row.title = trace;
  list.prepend(row);
  while (list.children.length > 8) list.lastElementChild.remove();
});

/* ---------- health ---------- */
async function health() {
  const el = $('#health');
  try { const r = await raw('GET', '/api/health'); if (r.status !== 200) throw 0; el.className = 'live ok'; el.lastElementChild.textContent = 'API + PostgreSQL up'; }
    const hero = $('#heroHealth'); if (hero) hero.innerHTML = '<span class="health-pulse"></span><strong>API + database connected</strong>';
  catch { el.className = 'live bad'; el.lastElementChild.textContent = 'Backend unavailable'; const hero = $('#heroHealth'); if (hero) hero.innerHTML = '<span class="health-pulse down"></span><strong>Backend unavailable</strong>'; }
}

/* ---------- login / session UI ---------- */
function renderSession() {
  $('#loginForm').hidden = !!auth; $('#session').hidden = !auth;
  $('#who').innerHTML = auth ? `<span>${esc(auth.user.email)} · ${esc(auth.user.role)}</span><button id="navOut">Sign out</button>` : '';
  $('#navOut')?.addEventListener('click', logout);
  if (!auth) return;
  $('#sessRole').textContent = auth.user.role;
  $('#sessWho').textContent = auth.user.name;
  $('#sessScope').textContent = auth.user.cityId == null ? 'all cities' : 'city ' + auth.user.cityId + ' only';
  $('#jwtView').textContent = JSON.stringify(unb64u(auth.token.split('.')[1]), null, 2);
}
function tick() {
  if (!auth) return;
  const left = unb64u(auth.token.split('.')[1]).exp - Math.floor(Date.now() / 1000);
  $('#sessTtl').textContent = left > 0 ? `${Math.floor(left / 60)}m ${String(left % 60).padStart(2, '0')}s` : 'expired';
}
async function doLogin(email, password) {
  const r = await raw('POST', '/api/auth/login', { body: { email, password } });
  if (r.status !== 200) throw Object.assign(new Error(r.json?.error?.message || 'Login failed'), { status: r.status, retry: r.headers.get('retry-after') });
  return r.json;
}
$('#form').addEventListener('submit', async (e) => {
  e.preventDefault(); const btn = $('#loginBtn'); btn.disabled = true; $('#loginErr').textContent = '';
  try { const d = await doLogin($('#email').value, $('#password').value); auth = { token: d.token, user: d.user }; saveAuth(); $('#password').value = ''; afterAuthChange(); }
  catch (err) { $('#loginErr').textContent = `${err.status || ''} ${err.message}${err.retry ? ' (retry in ' + err.retry + 's)' : ''}`; }
  btn.disabled = false;
});
async function logout() { try { await raw('POST', '/api/auth/logout', { token: auth.token }); } catch {} signOutLocal(); }
function signOutLocal(msg) { auth = null; saveAuth(); afterAuthChange(); if (msg) $('#loginErr').textContent = msg; }
$('#logoutBtn').addEventListener('click', logout);

/* ---------- RBAC matrix + demo buttons ---------- */
async function loadRbac() {
  rbac = (await raw('GET', '/api/auth/rbac')).json;
  const roles = Object.keys(rbac.roles), perms = [...new Set(Object.values(rbac.roles).flat())];
  $('#matrix').innerHTML = `<tr><th>Permission</th>${roles.map((r) => `<th class="c">${r}</th>`).join('')}</tr>` +
    perms.map((p) => `<tr><td class="mono">${p}</td>${roles.map((r) => rbac.roles[r].includes(p) ? '<td class="c matrix-yes">✓</td>' : '<td class="c matrix-no">–</td>').join('')}</tr>`).join('');
  $('#demo').innerHTML = rbac.demoAccounts.map((a) => `<button data-e="${esc(a.email)}" data-p="${esc(a.password)}">${esc(a.role)}</button>`).join('');
  $('#authAs').innerHTML = '<option value="session">My session</option><option value="none">No token</option><option value="tampered">Tampered token (payload edited)</option><option value="alg-none">Forged token (alg = none)</option>' +
    rbac.demoAccounts.map((a) => `<option value="demo:${esc(a.role)}">Demo login: ${esc(a.role)}</option>`).join('');
}
$('#demo').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { $('#email').value = b.dataset.e; $('#password').value = b.dataset.p; } });

/* ---------- token sources for the inspector and scenarios ---------- */
const demoCache = {};
async function demoToken(role) {
  const a = rbac.demoAccounts.find((x) => x.role === role);
  if (!demoCache[role] || unb64u(demoCache[role].split('.')[1]).exp * 1000 < Date.now() + 5000) demoCache[role] = (await doLogin(a.email, a.password)).token;
  return demoCache[role];
}
async function tokenFor(kind) {
  if (kind === 'none') return null;
  if (kind === 'session') return auth ? auth.token : null;
  if (kind.startsWith('demo:')) return demoToken(kind.slice(5));
  if (kind === 'tampered') { // take a real analyst token and rewrite its payload to claim user 1 (admin); signature no longer matches
    const [h, , s] = (await demoToken('analyst')).split('.');
    return `${h}.${b64u({ sub: '1', iss: 'zomato-ops-api', aud: 'zomato-ops-dashboard', exp: 9999999999 })}.${s}`;
  }
  if (kind === 'alg-none') return `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u({ sub: '1', iss: 'zomato-ops-api', aud: 'zomato-ops-dashboard', exp: 9999999999 })}.`;
  if (kind === 'garbage') return 'not.a.jwt';
  return null;
}

/* ---------- inspector ---------- */
const PRESETS = [
  { l: 'Orders, no token', m: 'GET', p: '/api/orders?limit=5', as: 'none', c: '401' },
  { l: 'Orders as analyst', m: 'GET', p: '/api/orders?limit=5', as: 'demo:analyst', c: '200' },
  { l: 'Analyst changes an order', m: 'PATCH', p: '/api/orders/149852/status', b: '{"status":"ACCEPTED"}', as: 'demo:analyst', c: '403' },
  { l: 'Bad query value', m: 'GET', p: '/api/orders?limit=abc', as: 'demo:admin', c: '400' },
  { l: 'SQL injection attempt', m: 'GET', p: "/api/orders?status=' OR 1=1--", as: 'demo:admin', c: '400' },
  { l: 'Extra body field', m: 'PATCH', p: '/api/orders/149852/status', b: '{"status":"ACCEPTED","total_amount":0}', as: 'demo:admin', c: '400' },
  { l: 'Unknown order', m: 'GET', p: '/api/orders/999999999', as: 'demo:admin', c: '404' },
  { l: 'Tampered token', m: 'GET', p: '/api/admin/users', as: 'tampered', c: '401' },
  { l: 'Forged alg=none', m: 'GET', p: '/api/admin/users', as: 'alg-none', c: '401' },
  { l: 'Manager, schema', m: 'GET', p: '/api/schema', as: 'demo:manager', c: '403' },
];
$('#presets').innerHTML = PRESETS.map((x, i) => `<button data-i="${i}"><i class="${x.c[0] === '2' ? 's2' : 's4'}">${x.c}</i>${esc(x.l)}</button>`).join('');
$('#presets').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return; const x = PRESETS[b.dataset.i];
  $('#method').value = x.m; $('#path').value = x.p; $('#body').value = x.b || ''; $('#authAs').value = x.as; sendRequest();
});
const badge = (s) => `<span class="badge ${s < 300 ? 's2' : s < 500 ? 's4' : 's5'}">${s}</span>`;
function chain(trace) {
  return `<div class="chain">${trace.split(' > ').map((t) => `<span class="${/: (4\d\d|BLOCKED)|BLOCKED/.test(t) ? 'stop' : /ok|left|issued|->|revoked/.test(t) ? 'ok' : ''}">${esc(t)}</span>`).join('')}</div>`;
}
async function sendRequest() {
  const btn = $('#sendBtn'); btn.disabled = true;
  try {
    const kind = $('#authAs').value, method = $('#method').value, path = $('#path').value.trim(), bodyText = $('#body').value.trim();
    const token = await tokenFor(kind);
    const r = await raw(method, path, { token, rawBody: bodyText || undefined });
    const h = (n) => r.headers.get(n);
    const shown = ['x-request-id', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'retry-after', 'www-authenticate', 'content-security-policy', 'x-content-type-options', 'x-frame-options', 'cache-control']
      .filter((n) => h(n)).map((n) => `<div><b>${n}</b>: ${esc(h(n))}</div>`).join('');
    $('#resp').innerHTML = `<div class="ch" style="padding:0 0 8px"><h3>${badge(r.status)} <small style="font:12px var(--mono);color:var(--mut)">${r.ms.toFixed(0)} ms</small></h3><span class="tag">${esc(method)} ${esc(path.split('?')[0])}</span></div>
      <h4 style="font-size:13px">Middleware trace</h4>${h('x-middleware-trace') ? chain(h('x-middleware-trace')) : '<p class="note">no trace</p>'}
      <h4 style="font-size:13px">Response headers</h4><div class="hdrs">${shown}</div>
      <h4 style="font-size:13px">Body</h4><pre>${esc(r.json ? JSON.stringify(r.json, null, 2).slice(0, 3500) : r.text.slice(0, 600) || '(empty)')}</pre>`;
  } catch (e) { $('#resp').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  btn.disabled = false;
}
$('#reqForm').addEventListener('submit', (e) => { e.preventDefault(); sendRequest(); });

/* ---------- scenarios ---------- */
async function runScenarios() {
  const btn = $('#runAll'); btn.disabled = true; btn.textContent = 'Running…';
  const admin = await demoToken('admin');
  const list = (await raw('GET', '/api/orders?limit=50', { token: admin })).json.data;
  const otherCity = list.find((o) => o.city_id !== 1)?.order_id ?? 1;
  const delivered = (await raw('GET', '/api/orders?status=DELIVERED&limit=1', { token: admin })).json.data[0].order_id;
  const big = JSON.stringify({ status: 'x'.repeat(20000) });
  const S = [
    ['Public health check needs no token', 'GET', '/api/health', 'none', 200],
    ['Orders without a token', 'GET', '/api/orders', 'none', 401],
    ['Garbage token', 'GET', '/api/orders', 'garbage', 401],
    ['Analyst token edited to claim admin', 'GET', '/api/admin/users', 'tampered', 401],
    ['Forged token with alg = none', 'GET', '/api/admin/users', 'alg-none', 401],
    ['Analyst reads orders', 'GET', '/api/orders?limit=3', 'demo:analyst', 200],
    ['Analyst tries to change an order', 'PATCH', '/api/orders/149852/status', 'demo:analyst', 403, '{"status":"ACCEPTED"}'],
    ['Manager opens admin/analyst-only schema', 'GET', '/api/schema', 'demo:manager', 403],
    ['Manager reads an order from another city', 'GET', `/api/orders/${otherCity}`, 'demo:manager', 403],
    ['Admin runs live EXPLAIN', 'GET', '/api/explain/R1', 'demo:admin', 200],
    ['limit=abc is rejected', 'GET', '/api/orders?limit=abc', 'demo:admin', 400],
    ["SQL injection in status filter", 'GET', "/api/orders?status=' OR 1=1--", 'demo:admin', 400],
    ['Unexpected body field (mass assignment)', 'PATCH', '/api/orders/149852/status', 'demo:admin', 400, '{"status":"ACCEPTED","total_amount":0}'],
    ['Malformed JSON body', 'PATCH', '/api/orders/149852/status', 'demo:admin', 400, '{bad json'],
    ['Oversized body (over 10 kB)', 'PATCH', '/api/orders/149852/status', 'demo:admin', 413, big],
    ['Unknown order id', 'GET', '/api/orders/999999999', 'demo:admin', 404],
    ['Illegal move: DELIVERED to PLACED', 'PATCH', `/api/orders/${delivered}/status`, 'demo:admin', 409, '{"status":"PLACED"}'],
  ];
  const rows = [];
  for (const [name, m, p, as, exp, b] of S) {
    const r = await raw(m, p, { token: await tokenFor(as), rawBody: b });
    rows.push({ name, m, p: p.split('?')[0], exp, got: r.status, trace: r.headers.get('x-middleware-trace') || '' });
    render(rows);
  }
  const probe = `brute${Date.now()}@zomato.test`; const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await raw('POST', '/api/auth/login', { body: { email: probe, password: 'guess' + i } })).status);
  rows.push({ name: 'Brute force: 6 wrong passwords in a row', m: 'POST', p: '/api/auth/login', exp: 429, got: codes[5], trace: 'attempts 1-5 → ' + codes.slice(0, 5).join(', ') + ', attempt 6 → ' + codes[5] });
  render(rows);
  btn.disabled = false; btn.textContent = 'Run again';
  if (auth && can('audit:read')) loadAudit();
  function render(rs) {
    const pass = rs.filter((x) => x.exp === x.got).length;
    $('#scoreTitle').textContent = `${pass} of ${rs.length} behaved as expected`;
    $('#scen').innerHTML = '<tr><th>Scenario</th><th>Request</th><th class="r">Expected</th><th class="r">Got</th><th></th><th>Pipeline</th></tr>' + rs.map((x) =>
      `<tr><td>${esc(x.name)}</td><td class="mono">${x.m} ${esc(x.p)}</td><td class="r mono">${x.exp}</td><td class="r mono"><b>${x.got}</b></td><td class="${x.exp === x.got ? 'pass' : 'fail'}">${x.exp === x.got ? '✓' : '✗'}</td><td class="mono wrap">${esc(x.trace)}</td></tr>`).join('');
  }
}
$('#runAll').addEventListener('click', () => runScenarios().catch((e) => { $('#scoreTitle').textContent = 'Error: ' + e.message; $('#runAll').disabled = false; }));

/* ---------- audit ---------- */
async function loadAudit() {
  if (!can('audit:read')) { $('#auditBody').innerHTML = `<div class="locked">${auth ? 'Your role (' + esc(auth.user.role) + ') lacks audit:read. Sign in as admin.' : 'Sign in as admin to view.'}</div>`; return; }
  try {
    const rows = await api('/api/admin/audit?security=true&limit=25');
    $('#auditBody').innerHTML = '<table><tr><th>Time</th><th>Status</th><th>Request</th><th>User</th><th>Request id</th></tr>' + (rows.length ? rows.map((e) =>
      `<tr><td class="mono">${esc(e.time.slice(11, 19))}</td><td>${badge(e.status)}</td><td class="mono">${esc(e.method)} ${esc(e.path)}</td><td>${esc(e.user || 'anonymous')}</td><td class="mono">${esc(e.requestId.slice(0, 8))}</td></tr>`).join('') : '<tr><td colspan="5">No security events yet.</td></tr>') + '</table>';
  } catch (e) { $('#auditBody').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}
$('#auditBtn').addEventListener('click', loadAudit);

function showToast(message, success) {
  let toast = document.getElementById('toast');
  if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = message;
  toast.className = 'toast ' + (success ? 'success' : 'failure');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.remove('success','failure'), 3600);
}

/* ---------- protected data panels ---------- */
const lock = (name, perm, msg) => {
  const ok = perm ? can(perm) : !!auth;
  $(`#${name}-lock`).hidden = ok; $(`#${name}-data`).hidden = !ok;
  if (!ok) $(`#${name}-lock`).textContent = !auth ? 'Sign in to load this section.' : msg || `Your role (${auth.user.role}) lacks ${perm}.`;
  return ok;
};
async function overview() {
  if (!lock('overview', 'overview:read')) return;
  const [o, orders, rests] = await Promise.all([api('/api/overview'), api('/api/orders?limit=8'), api('/api/restaurants')]);
  $('#scopeTag').textContent = 'scope: ' + o.scope;
  $('#kpis').innerHTML = [['ORDERS', num(o.orders), '', 1], ['CUSTOMERS', num(o.customers)], ['RESTAURANTS', num(o.restaurants)], ['ACTIVE PARTNERS', num(o.active_partners)], ['AVG DELIVERY', o.avg_delivery_minutes, ' min'], ['IN PROGRESS', num(o.attention), ' orders']]
    .map(([l, v, s = '', hi]) => `<div class="kpi ${hi ? 'hi' : ''}"><span>${l}</span><strong>${esc(v)}<small>${s}</small></strong></div>`).join('');
  $('#orders').innerHTML = '<tr><th>Order</th><th>Customer</th><th>Restaurant</th><th>Status</th><th class="r">Total</th><th>Action</th></tr>' + orders.data.map((x) => {
    const next = ({ PLACED: ['ACCEPTED','CANCELLED_BY_RESTAURANT'], ACCEPTED: ['PREPARING','CANCELLED_BY_RESTAURANT'], PREPARING: ['OUT_FOR_DELIVERY'], OUT_FOR_DELIVERY: ['DELIVERED'] })[x.status] || [];
    const actions = can('orders:update') && next.length
      ? `<select class="order-next" aria-label="Next status for order ${x.order_id}" data-order="${x.order_id}">${next.map(s => `<option value="${s}">${s.replaceAll('_',' ')}</option>`).join('')}</select><button class="btn sm order-update" data-order="${x.order_id}">Update</button>`
      : '<span class="note">Read only</span>';
    return `<tr><td class="mono">#${x.order_id}</td><td>${esc(x.customer_name)}</td><td>${esc(x.restaurant_name)}</td><td>${stat(x.status)}</td><td class="r"><b>${inr(x.total_amount)}</b></td><td>${actions}</td></tr>`;
  }).join('');
  $('#orders').querySelectorAll('.order-update').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.order;
    const select = $('#orders').querySelector(`.order-next[data-order="${id}"]`);
    if (!select) return;
    button.disabled = true; button.textContent = 'Saving…';
    try {
      const result = await api(`/api/orders/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status: select.value } });
      console.info('[ORDER UPDATED]', result);
      await overview();
      showToast(`Order #${id} changed to ${result.status}`, true);
    } catch (error) {
      console.error('[ORDER UPDATE FAILED]', error, error.response?.json);
      showToast(`${error.status || 'Network'} · ${error.message}`, false);
      button.disabled = false; button.textContent = 'Retry';
    }
  }));
  const ok = Number(o.successful), bad = Number(o.failed), rate = ok + bad ? (ok / (ok + bad)) * 100 : 0;
  $('#rate').textContent = rate.toFixed(1) + '%'; $('#ok').textContent = num(ok); $('#bad').textContent = num(bad);
  $('#donut').style.setProperty('--p', rate * 3.6 + 'deg');
  $('#rests').innerHTML = rests.map((r, i) => `<div class="rrow"><span class="mono">0${i + 1}</span><div><b>${esc(r.name)}</b><small>${esc(r.locality_name)}, ${esc(r.city_name)}</small></div><span>★ ${esc(r.rating ?? '—')}</span><div><b>${num(r.delivered_orders)}</b><small>delivered</small></div>${stat(r.status)}</div>`).join('');
}
async function schema() {
  if (!lock('schema', 'schema:read')) return;
  const t = await api('/api/schema'); const sum = (k) => t.reduce((a, x) => a + x[k], 0);
  $('#schema-table').innerHTML = '<tr><th>Table</th><th class="r">Rows</th><th class="r">Cols</th><th class="r">PK</th><th class="r">FK</th><th class="r">UNIQUE</th><th class="r">CHECK</th><th class="r">Indexes</th><th class="r">Size</th></tr>' +
    t.map((x) => `<tr><td class="mono"><b>${esc(x.table_name)}</b></td><td class="r">${num(x.approx_rows)}</td><td class="r">${x.columns}</td><td class="r">${x.pk}</td><td class="r">${x.fk}</td><td class="r">${x.uniq}</td><td class="r">${x.checks}</td><td class="r">${x.indexes}</td><td class="r">${esc(x.size)}</td></tr>`).join('') +
    `<tr><td><b>Total</b></td><td></td><td class="r"><b>${sum('columns')}</b></td><td class="r"><b>${sum('pk')}</b></td><td class="r"><b>${sum('fk')}</b></td><td class="r"><b>${sum('uniq')}</b></td><td class="r"><b>${sum('checks')}</b></td><td class="r"><b>${sum('indexes')}</b></td><td></td></tr>`;
}
function renderList() {
  $('#qitems').innerHTML = queries.filter((q) => filter === 'ALL' || q.type === filter).map((q) =>
    `<button class="qi ${q.type === 'WRITE' ? 'w' : ''} ${current === q.id ? 'on' : ''}" data-id="${q.id}"><b>${q.id}</b><span>${esc(q.title)}</span><em>${q.avg != null ? ms(q.avg) + ' ms' : ''}</em></button>`).join('');
}
function showQuery(id) {
  const q = queries.find((x) => x.id === id); current = id; renderList();
  $('#qview').innerHTML = `<span class="tag">${q.type}</span><h3>${q.id} · ${esc(q.title)}</h3>
    <div class="meta">${q.avg != null ? `<span>Average <b>${ms(q.avg)} ms</b></span><span>Runs <b>${q.runs.map(ms).join(' / ')}</b></span><span>Scan <b>${esc(q.scan)}</b></span>` : ''}</div><pre>${esc(q.sql)}</pre>
    ${q.type === 'READ' ? (can('explain:run') ? '<button class="btn" id="run">Run live EXPLAIN (ANALYZE, BUFFERS)</button><div id="plan"></div>' : '<p class="note">Live EXPLAIN needs the explain:run permission (admin only).</p>') : '<p class="note">Write queries are not executed from the browser.</p>'}`;
  $('#run')?.addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true; b.textContent = 'Running…';
    try { const d = await api('/api/explain/' + id); $('#plan').innerHTML = `<pre class="plan">${esc(d.plan.join('\n'))}</pre>`; } catch (err) { $('#plan').innerHTML = `<p class="err">${esc(err.message)}</p>`; }
    b.disabled = false; b.textContent = 'Run again';
  });
}
function renderPerformance() {
  const rows = queries.filter((q) => q.avg != null).sort((a, b) => b.avg - a.avg), max = rows[0].avg;
  const cls = (s) => (/^Index/.test(s) ? 'i' : s === 'Seq Scan' ? '' : 'n');
  $('#bars').innerHTML = rows.map((q) => `<div class="brow"><b>${q.id}</b><div class="track"><div class="fill ${cls(q.scan)}" style="width:${Math.max((q.avg / max) * 100, 0.8)}%"></div></div><span>${ms(q.avg)} ms</span></div>`).join('');
  const reads = rows.filter((q) => q.type === 'READ'), seq = rows.filter((q) => q.scan === 'Seq Scan').length;
  $('#perfstats').innerHTML = [['Queries measured', rows.length, `${reads.length} read · ${rows.length - reads.length} write`], ['Slowest', `${rows[0].id} · ${ms(rows[0].avg)} ms`, rows[0].title], ['Using Seq Scan', `${seq} of ${rows.length}`, 'Baseline has no tuning indexes.']]
    .map(([a, b, c]) => `<div class="card pad"><h4>${a}</h4><div class="kpi" style="border:0;padding:0"><strong>${esc(b)}</strong></div><p>${esc(c)}</p></div>`).join('');
}
async function queryLab() {
  const ok = lock('queries', 'queries:read'); $('#perf-data').hidden = !ok; if (!ok) return;
  queries = await api('/api/queries'); renderList(); showQuery(queries[0].id); renderPerformance();
}
$('#qitems').addEventListener('click', (e) => { const b = e.target.closest('.qi'); if (b) showQuery(b.dataset.id); });
$('#seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; filter = b.dataset.f; document.querySelectorAll('#seg button').forEach((x) => x.classList.toggle('on', x === b)); renderList(); });

function afterAuthChange() {
  renderSession(); tick();
  const fail = (id) => (e) => { const el = $(`#${id}-lock`); el.hidden = false; $(`#${id}-data`).hidden = true; el.textContent = 'Could not load: ' + e.message; console.error('[SECTION LOAD FAILED]', id, e); };
  if (!auth) {
    ['overview','schema','queries'].forEach(id => { $(`#${id}-lock`).hidden = false; $(`#${id}-data`).hidden = true; });
    $('#overview-lock').textContent = 'Sign in to load live operational data.';
    $('#schema-lock').textContent = 'Sign in as analyst or admin to inspect the schema.';
    $('#queries-lock').textContent = 'Sign in as analyst or admin to open the query lab.';
    $('#perf-data').hidden = true;
    $('#auditBody').innerHTML = '<div class="locked">Sign in as admin to view security events.</div>';
    return;
  }
  overview().catch(fail('overview')); schema().catch(fail('schema')); queryLab().catch(fail('queries')); loadAudit();
}

health(); setInterval(health, 15000); setInterval(tick, 1000);
loadRbac().then(afterAuthChange).catch((e) => { console.error(e); $('#loginErr').textContent = 'Could not start: ' + e.message; });
