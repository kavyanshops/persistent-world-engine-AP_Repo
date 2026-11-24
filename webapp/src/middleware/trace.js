// Records which middleware ran, in order, and exposes it as the X-Middleware-Trace response header.
// Used by the Request Inspector in the UI to show the pipeline working. Disable with TRACE_HEADER=off.
const cfg = require('../config');
const step = (req, text) => { if (req.trace) req.trace.push(text); };

function trace(req, res, next) {
  req.trace = [];
  if (cfg.traceHeader) {
    const writeHead = res.writeHead;
    res.writeHead = function (...args) {
      if (!res.headersSent) res.setHeader('X-Middleware-Trace', req.trace.join(' > '));
      return writeHead.apply(this, args);
    };
  }
  next();
}
module.exports = { trace, step };
