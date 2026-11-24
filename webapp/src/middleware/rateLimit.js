const { step } = require('./trace');

// Fixed-window in-memory rate limiter. One factory, used twice: a loose global limit and a strict login limit.
// (Single process only. Behind several instances this store would move to Redis.)
function createRateLimiter({ name, windowMs, max, keyFn }) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset <= now) hits.delete(k); }, windowMs).unref();

  const middleware = (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset <= now) { h = { count: 0, reset: now + windowMs }; hits.set(key, h); }
    h.count += 1;
    req.rateKey = key;
    const remaining = Math.max(max - h.count, 0);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(h.reset / 1000)));
    if (h.count > max) {
      const retry = Math.ceil((h.reset - now) / 1000);
      res.setHeader('Retry-After', String(retry));
      step(req, `rateLimit(${name}): BLOCKED`);
      return next(Object.assign(new Error(`Too many requests. Try again in ${retry}s.`), { status: 429, code: 'RATE_LIMITED' }));
    }
    step(req, `rateLimit(${name}): ${remaining} left`);
    next();
  };
  middleware.reset = (key) => hits.delete(key);
  return middleware;
}
module.exports = { createRateLimiter };
