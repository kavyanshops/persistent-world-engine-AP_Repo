const path = require('node:path');
const fs = require('node:fs');
const DBMS = path.join(__dirname, '..', '..', 'dbms');

// Parses dbms/04_queries.sql (-- @ID markers) and the recorded timings in dbms/05_query_timings.md
function loadQueries() {
  const parts = fs.readFileSync(path.join(DBMS, '04_queries.sql'), 'utf8').split(/^-- @(\w+)\s*$/m);
  const timings = {};
  for (const line of fs.readFileSync(path.join(DBMS, '05_query_timings.md'), 'utf8').split('\n')) {
    const c = line.split('|').map((x) => x.trim());
    if (/^[RW]\d+$/.test(c[1] || '')) timings[c[1]] = { runs: [c[4], c[5], c[6]].map(Number), avg: Number(c[7]), scan: c[8] };
  }
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    const lines = parts[i + 1].split('\n');
    const title = (lines.find((l) => l.startsWith('-- ')) || '').replace(/^-- (READ|WRITE):\s*/, '');
    const sql = lines.filter((l) => !l.trim().startsWith('--')).join('\n').trim();
    out.push({ id: parts[i], type: parts[i][0] === 'R' ? 'READ' : 'WRITE', title, sql, ...(timings[parts[i]] || {}) });
  }
  return out;
}
module.exports = { loadQueries, DBMS };
