const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const cfg = require('../config').jwt;

// Revoked token ids (logout). Entries are dropped once the token would have expired anyway.
const revoked = new Map();
setInterval(() => { const now = Date.now(); for (const [id, exp] of revoked) if (exp < now) revoked.delete(id); }, 60_000).unref();

// The token carries only who (sub) and which token (jti). Role and scope are looked up server-side on every request,
// so a stolen or edited payload can never grant more than the user store allows.
function issue(user) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({}, cfg.secret, {
    algorithm: cfg.algorithm, subject: String(user.id), jwtid: jti,
    issuer: cfg.issuer, audience: cfg.audience, expiresIn: cfg.expiresInSeconds,
  });
  return { token, expiresIn: cfg.expiresInSeconds };
}

function verify(token) {
  const payload = jwt.verify(token, cfg.secret, { algorithms: [cfg.algorithm], issuer: cfg.issuer, audience: cfg.audience });
  if (revoked.has(payload.jti)) { const e = new Error('revoked'); e.name = 'RevokedTokenError'; throw e; }
  return payload;
}
const revoke = (payload) => revoked.set(payload.jti, payload.exp * 1000);
module.exports = { issue, verify, revoke };
