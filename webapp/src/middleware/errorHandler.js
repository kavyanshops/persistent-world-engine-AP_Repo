// The single place errors become responses. Internals (stack traces, SQL, pg messages) never reach the client.
const PG = { '23505': [409, 'DUPLICATE', 'Resource already exists'], '23503': [409, 'REFERENCE_CONFLICT', 'Referenced row is missing or in use'],
  '23514': [409, 'CONSTRAINT_VIOLATION', 'Change violates a database rule'], '22P02': [400, 'BAD_INPUT', 'Malformed input value'] };

function errorHandler(err, req, res, _next) {
  let status = err.status || 500, code = err.code, message = err.message, details = err.details;
  if (err.type === 'entity.parse.failed') { status = 400; code = 'INVALID_JSON'; message = 'Request body is not valid JSON.'; }
  else if (err.type === 'entity.too.large') { status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body is too large.'; }
  else if (PG[err.code]) [status, code, message] = PG[err.code];
  else if (!err.status) {
    status = 500; code = 'INTERNAL_ERROR'; message = 'Something went wrong on our side.'; details = undefined;
    console.error(JSON.stringify({ level: 'error', requestId: req.id, message: err.message, stack: err.stack }));
  }
  if (res.headersSent) return;
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}), requestId: req.id } });
}
module.exports = errorHandler;
