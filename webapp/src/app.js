const path = require('node:path');
const express = require('express');
const cfg = require('./config');
const { query } = require('./db');
const { trace } = require('./middleware/trace');
const requestId = require('./middleware/requestId');
const securityHeaders = require('./middleware/securityHeaders');
const logger = require('./middleware/logger');
const { createRateLimiter } = require('./middleware/rateLimit');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const { DBMS } = require('./queries');

const app = express();
app.disable('x-powered-by');           // do not advertise the framework
app.set('trust proxy', process.env.TRUST_PROXY === '1'); // only believe X-Forwarded-For behind a real proxy

// ---- Pipeline, in order. Order matters: each step relies on the ones above it. ----
app.use(trace);              // 1. start the per-request trace
app.use(requestId);          // 2. correlation id
app.use(securityHeaders);    // 3. hardening headers on every response
app.use(logger);             // 4. structured log + audit entry when the response finishes

// Static files are public and skip the API pipeline.
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/dbms/02_er_diagram.png', (_req, res) => res.sendFile(path.join(DBMS, '02_er_diagram.png')));

const api = express.Router();
api.use(createRateLimiter({ name: 'global', windowMs: 60_000, max: cfg.limits.globalPerMinute, keyFn: (req) => req.ip })); // 5. throttle
api.use(express.json({ limit: cfg.limits.bodyBytes }));  // 6. parse JSON, capped at 10 kB
api.get('/health', async (_req, res) => {                // public
  try { await query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); }
  catch { res.status(503).json({ status: 'error', database: 'unavailable' }); }
});
api.use('/auth', require('./routes/auth'));              // 7. public login + token routes
api.use(require('./routes/data'));                       // 8. authenticate > authorize > validate > handler
api.use(notFound);
app.use('/api', api);
app.use(notFound);
app.use(errorHandler);                                   // 9. last: every error ends here

module.exports = app;
