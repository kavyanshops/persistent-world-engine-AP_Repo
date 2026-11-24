// In-memory ring buffer of the most recent requests. Feeds the admin-only audit endpoint.
const MAX = 200;
const entries = [];
module.exports = {
  record(entry) { entries.push(entry); if (entries.length > MAX) entries.shift(); },
  list({ limit = 50, securityOnly = false } = {}) {
    const rows = securityOnly ? entries.filter((e) => e.security) : entries;
    return rows.slice(-limit).reverse();
  },
};
