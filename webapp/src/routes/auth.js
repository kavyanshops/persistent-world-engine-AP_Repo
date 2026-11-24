const router = require('express').Router();
const bcrypt = require('bcryptjs');
const users = require('../auth/users');
const tokens = require('../auth/tokens');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { createRateLimiter } = require('../middleware/rateLimit');
const { E } = require('../errors');
const { step } = require('../middleware/trace');
const cfg = require('../config');
const { PERMISSIONS } = require('../auth/rbac');

// Brute-force protection: 5 attempts per minute per (IP + email). A successful login clears the counter.
const loginLimiter = createRateLimiter({
  name: 'login', windowMs: 60_000, max: cfg.limits.loginPerMinute,
  keyFn: (req) => `${req.ip}|${String((req.body && req.body.email) || '').toLowerCase()}`,
});

router.post('/login', loginLimiter,
  validate({ body: { email: { type: 'email', required: true, max: 100 }, password: { type: 'string', required: true, min: 1, max: 100 } } }),
  async (req, res, next) => {
    try {
      const { email, password } = req.valid.body;
      const user = users.findByEmail(email);
      const ok = await bcrypt.compare(password, user ? user.passwordHash : users.DUMMY_HASH);
      if (!user || !ok) {
        step(req, 'login: 401 bad credentials');
        res.setHeader('WWW-Authenticate', 'Bearer error="invalid_credentials"');
        throw E.unauthorized('INVALID_CREDENTIALS', 'Invalid email or password.'); // same answer for unknown email and wrong password
      }
      loginLimiter.reset(req.rateKey);
      const { token, expiresIn } = tokens.issue(user);
      step(req, 'login: token issued');
      res.json({ token, tokenType: 'Bearer', expiresIn, user: users.publicView(user) });
    } catch (e) { next(e); }
  });

router.get('/me', authenticate, (req, res) => res.json({ user: req.user, tokenExpiresAt: new Date(req.tokenPayload.exp * 1000).toISOString() }));

router.post('/logout', authenticate, (req, res) => { tokens.revoke(req.tokenPayload); step(req, 'logout: token revoked'); res.status(204).end(); });

// Public documentation of the access model (no secrets in it).
router.get('/rbac', (_req, res) => res.json({ roles: PERMISSIONS, scopes: { manager: 'Orders limited to the manager\'s own city (data-level authorization).' },
  demoAccounts: users.demoAccounts.map(({ email, role, password }) => ({ email, role, password })) }));

module.exports = router;
