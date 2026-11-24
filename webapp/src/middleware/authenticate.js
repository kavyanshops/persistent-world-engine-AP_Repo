const tokens = require('../auth/tokens');
const users = require('../auth/users');
const { PERMISSIONS } = require('../auth/rbac');
const { E } = require('../errors');
const { step } = require('./trace');

// AUTHENTICATION: who is calling? Expects "Authorization: Bearer <jwt>".
// Success sets req.user. Failure is always 401 with a WWW-Authenticate challenge.
function authenticate(req, res, next) {
  const fail = (code, message, why) => {
    step(req, `authenticate: 401 ${why}`);
    res.setHeader('WWW-Authenticate', `Bearer error="${code.toLowerCase()}"`);
    next(E.unauthorized(code, message));
  };
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (!header) return fail('TOKEN_MISSING', 'Authentication required: send Authorization: Bearer <token>.', 'no token');
  if (scheme !== 'Bearer' || !token) return fail('TOKEN_MALFORMED', 'Authorization header must be "Bearer <token>".', 'malformed header');

  let payload;
  try {
    payload = tokens.verify(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') return fail('TOKEN_EXPIRED', 'Token has expired. Log in again.', 'expired');
    if (err.name === 'RevokedTokenError') return fail('TOKEN_REVOKED', 'Token was revoked (logged out).', 'revoked');
    return fail('TOKEN_INVALID', 'Token is invalid.', 'bad signature/claims');
  }
  const user = users.findById(Number(payload.sub));
  if (!user) return fail('TOKEN_INVALID', 'Token is invalid.', 'unknown user');

  req.user = { ...users.publicView(user), permissions: PERMISSIONS[user.role] };
  req.tokenPayload = payload;
  step(req, `authenticate: ok ${user.role}`);
  next();
}
module.exports = authenticate;
