const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => Number(v || 0).toLocaleString('en-IN');
const inr = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const ms = (v) => (v < 1 ? v.toFixed(3) : v.toFixed(2));
const j = async (p) => { const r = await fetch(p); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Request failed'); return d; };
const stat = (s) => `<span class="st ${esc(s.toLowerCase())}">${esc(s.replaceAll('_', ' '))}</span>`;
let queries = [], filter = 'ALL', current = null;

async function health() {
  const el = $('#health');
  try { await j('/api/health'); el.className = 'live ok'; el.lastElementChild.textContent = 'PostgreSQL connected'; }
  catch { el.className = 'live bad'; el.lastElementChild.textContent = 'Database unavailable'; }
}

async function overview() {
  const [o, orders, rests] = await Promise.all([j('/api/overview'), j('/api/orders?limit=8'), j('/api/restaurants')]);
  $('#kpis').innerHTML = [['ORDERS', num(o.orders), '', 1], ['CUSTOMERS', num(o.customers)], ['RESTAURANTS', num(o.restaurants)],
    ['ACTIVE PARTNERS', num(o.active_partners)], ['AVG DELIVERY', o.avg_delivery_minutes, ' min'], ['IN PROGRESS', num(o.attention), ' orders']]
    .map(([l, v, s = '', hi]) => `<div class="kpi ${hi ? 'hi' : ''}"><span>${l}</span><strong>${esc(v)}<small>${s}</small></strong></div>`).join('');
  $('#orders').innerHTML = '<tr><th>Order</th><th>Customer</th><th>Restaurant</th><th>Status</th><th class="r">Total</th></tr>' + orders.map((x) =>
    `<tr><td class="mono">#${x.order_id}</td><td>${esc(x.customer_name)}</td><td>${esc(x.restaurant_name)}</td><td>${stat(x.status)}</td><td class="r"><b>${inr(x.total_amount)}</b></td></tr>`).join('');
  const ok = Number(o.successful), bad = Number(o.failed), rate = ok + bad ? (ok / (ok + bad)) * 100 : 0;
  $('#rate').textContent = rate.toFixed(1) + '%'; $('#ok').textContent = num(ok); $('#bad').textContent = num(bad);
  $('#donut').style.setProperty('--p', rate * 3.6 + 'deg');
  $('#rests').innerHTML = rests.map((r, i) => `<div class="rrow"><span class="mono">0${i + 1}</span><div><b>${esc(r.name)}</b><small>${esc(r.locality_name)}, ${esc(r.city_name)}</small></div><span>★ ${esc(r.rating ?? '—')}</span><div><b>${num(r.delivered_orders)}</b><small>delivered</small></div>${stat(r.status)}</div>`).join('');
}

async function schema() {
  const t = await j('/api/schema');
  const sum = (k) => t.reduce((a, x) => a + x[k], 0);
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
    <div class="meta">${q.avg != null ? `<span>Average <b>${ms(q.avg)} ms</b></span><span>Runs <b>${q.runs.map(ms).join(' / ')}</b></span><span>Scan <b>${esc(q.scan)}</b></span>` : ''}</div>
    <pre>${esc(q.sql)}</pre>
    ${q.type === 'READ' ? '<button class="btn" id="run">Run live EXPLAIN (ANALYZE, BUFFERS)</button><div id="plan"></div>' : '<p class="note">Write queries are not executed from the browser. Their plans were recorded inside BEGIN … ROLLBACK.</p>'}`;
  $('#run')?.addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true; b.textContent = 'Running…';
    try { const d = await j('/api/explain/' + id); $('#plan').innerHTML = `<pre class="plan">${esc(d.plan.join('\n'))}</pre><p class="note">Live run on this machine, so timings differ from the recorded table.</p>`; }
    catch (err) { $('#plan').innerHTML = `<p class="err">${esc(err.message)}</p>`; }
    b.disabled = false; b.textContent = 'Run again';
  });
}

function performance() {
  const rows = queries.filter((q) => q.avg != null).sort((a, b) => b.avg - a.avg), max = rows[0].avg;
  const cls = (s) => (/^Index/.test(s) ? 'i' : s === 'Seq Scan' ? '' : 'n');
  $('#bars').innerHTML = rows.map((q) => `<div class="brow"><b>${q.id}</b><div class="track"><div class="fill ${cls(q.scan)}" style="width:${Math.max((q.avg / max) * 100, 0.8)}%"></div></div><span>${ms(q.avg)} ms</span></div>`).join('');
  const reads = rows.filter((q) => q.type === 'READ'), seq = rows.filter((q) => q.scan === 'Seq Scan').length;
  $('#perfstats').innerHTML = [['Queries measured', rows.length, `${reads.length} read · ${rows.length - reads.length} write`], ['Slowest', `${rows[0].id} · ${ms(rows[0].avg)} ms`, rows[0].title],
    ['Using Seq Scan', `${seq} of ${rows.length}`, 'Expected: the baseline has no tuning indexes. Phase 4 adds them.']]
    .map(([a, b, c]) => `<div class="card pad"><h4>${a}</h4><div class="kpi" style="border:0;padding:0"><strong>${esc(b)}</strong></div><p>${esc(c)}</p></div>`).join('');
}

$('#qitems').addEventListener('click', (e) => { const b = e.target.closest('.qi'); if (b) showQuery(b.dataset.id); });
$('#seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; filter = b.dataset.f; document.querySelectorAll('#seg button').forEach((x) => x.classList.toggle('on', x === b)); renderList(); });

health(); setInterval(health, 15000);
overview().catch(() => { $('#kpis').innerHTML = '<div class="err">Database unavailable. Check the PostgreSQL connection settings.</div>'; });
schema().catch(() => { $('#schema-table').innerHTML = '<tr><td class="err">Schema unavailable.</td></tr>'; });
j('/api/queries').then((q) => { queries = q; renderList(); showQuery(q[0].id); performance(); }).catch(() => { $('#qview').innerHTML = '<div class="err">Could not load dbms/04_queries.sql.</div>'; });
