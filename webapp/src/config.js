const crypto = require('node:crypto');

// All security-relevant settings live here, read from the environment.
const secretFromEnv = process.env.JWT_SECRET;
if (!secretFromEnv) {
  console.warn('[config] JWT_SECRET not set: using a random per-process secret. Tokens will stop working on restart.');
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  jwt: {
    secret: secretFromEnv || crypto.randomBytes(48).toString('hex'),
    algorithm: 'HS256',            // pinned on sign AND verify, so alg=none / alg-swap attacks fail
    issuer: 'zomato-ops-api',
    audience: 'zomato-ops-dashboard',
    expiresInSeconds: Number(process.env.JWT_TTL_SECONDS || 30 * 60),
  },
  limits: {
    bodyBytes: '10kb',
    globalPerMinute: Number(process.env.RATE_GLOBAL || 300),
    loginPerMinute: Number(process.env.RATE_LOGIN || 5),
  },
  traceHeader: process.env.TRACE_HEADER !== 'off', // X-Middleware-Trace is a debugging aid: turn off in production
  logLevel: process.env.LOG || 'info',
};
