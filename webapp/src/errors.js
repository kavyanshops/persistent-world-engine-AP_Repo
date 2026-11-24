// One error type for every expected failure. The error handler turns it into JSON.
class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
const E = {
  badRequest: (m, d) => new HttpError(400, 'BAD_REQUEST', m, d),
  validation: (d) => new HttpError(400, 'VALIDATION_ERROR', 'Request validation failed', d),
  unauthorized: (code, m) => new HttpError(401, code, m),
  forbidden: (m) => new HttpError(403, 'FORBIDDEN', m),
  notFound: (m = 'Resource not found') => new HttpError(404, 'NOT_FOUND', m),
  conflict: (m) => new HttpError(409, 'CONFLICT', m),
};
module.exports = { HttpError, E };
