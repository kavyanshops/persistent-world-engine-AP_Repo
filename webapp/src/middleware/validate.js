const { E } = require('../errors');
const { step } = require('./trace');

// Declarative request validation. Anything not declared in a body is rejected (blocks mass assignment).
// rule: { type: 'int'|'string'|'email'|'enum', required, min, max, values, default }
function check(value, rule) {
  if (rule.type === 'int') {
    if (!/^-?\d+$/.test(String(value))) return 'must be an integer';
    const n = Number(value);
    if (!Number.isSafeInteger(n)) return 'is out of range';
    if (rule.min != null && n < rule.min) return `must be >= ${rule.min}`;
    if (rule.max != null && n > rule.max) return `must be <= ${rule.max}`;
    return { value: n };
  }
  if (typeof value !== 'string') return 'must be a string';
  const s = value.trim();
  if (rule.type === 'enum') return rule.values.includes(s) ? { value: s } : `must be one of ${rule.values.join(', ')}`;
  if (rule.min != null && s.length < rule.min) return `must be at least ${rule.min} characters`;
  if (rule.max != null && s.length > rule.max) return `must be at most ${rule.max} characters`;
  if (rule.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'must be a valid email';
  return { value: rule.type === 'email' ? s.toLowerCase() : s };
}

function validate(schema) {
  return (req, _res, next) => {
    const errors = [];
    const out = {};
    for (const where of ['params', 'query', 'body']) {
      const rules = schema[where];
      if (!rules) continue;
      const input = where === 'body' && (req.body == null || typeof req.body !== 'object' || Array.isArray(req.body)) ? {} : req[where] || {};
      out[where] = {};
      if (where === 'body') {
        for (const k of Object.keys(input)) if (!rules[k]) errors.push({ in: where, field: k, message: 'unexpected field' });
      }
      for (const [field, rule] of Object.entries(rules)) {
        const raw = input[field];
        if (raw === undefined || raw === '') {
          if (rule.required) errors.push({ in: where, field, message: 'is required' });
          else if (rule.default !== undefined) out[where][field] = rule.default;
          continue;
        }
        const r = check(raw, rule);
        if (typeof r === 'string') errors.push({ in: where, field, message: r });
        else out[where][field] = r.value;
      }
    }
    if (errors.length) { step(req, `validate: 400 (${errors.length} error${errors.length > 1 ? 's' : ''})`); return next(E.validation(errors)); }
    req.valid = out;
    step(req, 'validate: ok');
    next();
  };
}
module.exports = validate;
