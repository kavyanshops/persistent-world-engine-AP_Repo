const crypto = require('node:crypto');
const { step } = require('./trace');

// Every request gets an id, echoed in the response and in every log line and error body.
function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  step(req, 'requestId');
  next();
}
module.exports = requestId;
