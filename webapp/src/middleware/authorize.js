const { can } = require('../auth/rbac');
const { E } = require('../errors');
const { step } = require('./trace');

// AUTHORIZATION: may this caller do this? Runs after authenticate. 403 means "we know who you are, and no".
const authorize = (permission) => (req, _res, next) => {
  if (!req.user) return next(E.unauthorized('TOKEN_MISSING', 'Authentication required.'));
  if (!can(req.user.role, permission)) {
    step(req, `authorize(${permission}): 403`);
    return next(E.forbidden(`Role "${req.user.role}" lacks permission "${permission}".`));
  }
  step(req, `authorize(${permission}): ok`);
  next();
};
module.exports = authorize;
