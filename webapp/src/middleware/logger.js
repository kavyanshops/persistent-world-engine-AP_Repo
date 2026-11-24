const cfg = require('../config');
const audit = require('../audit');

// Logs one structured JSON line per request after the response finishes, and stores it for the audit endpoint.
function logger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const entry = {
      time: new Date().toISOString(), requestId: req.id, method: req.method,
      path: req.originalUrl.split('?')[0], status: res.statusCode,
      ms: Number((Number(process.hrtime.bigint() - start) / 1e6).toFixed(1)),
      user: req.user ? req.user.email : null, role: req.user ? req.user.role : null, ip: req.ip,
      security: res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 429,
    };
    if (req.originalUrl.startsWith('/api')) audit.record(entry);
    if (cfg.logLevel !== 'silent' && req.originalUrl.startsWith('/api')) console.log(JSON.stringify(entry));
  });
  next();
}
module.exports = logger;
