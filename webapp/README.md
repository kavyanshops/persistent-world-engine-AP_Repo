# Zomato Backend: Express API with JWT auth, RBAC and a middleware pipeline

Node.js + Express API over the `zomato_ap` PostgreSQL database (11 tables, 150,000 orders), with a browser console that exercises every security rule against the live server.

## Run

```bash
npm install
npm start          # http://localhost:3000
npm test           # 13 integration tests over real HTTP, against the real database
```

Database settings use the usual `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` or `DATABASE_URL`. Set `JWT_SECRET` in any real deployment (without it a random secret is generated per process and tokens die on restart).

Demo accounts (printed at startup):

| Role | Email | Password | Can do |
|------|-------|----------|--------|
| admin | admin@zomato.test | Admin@12345 | everything, all cities |
| manager | manager.blr@zomato.test | Manager@12345 | read and update orders, **Bengaluru only** |
| analyst | analyst@zomato.test | Analyst@12345 | read-only, plus schema and query lab |

## Layout

```
server.js                 starts the app
src/app.js                the pipeline, in order
src/config.js             all security settings (JWT, limits)
src/errors.js             HttpError + helpers
src/middleware/           trace, requestId, securityHeaders, logger, rateLimit,
                          authenticate, authorize, validate, notFound, errorHandler
src/auth/                 users (bcrypt), tokens (JWT sign/verify/revoke), rbac (role -> permissions)
src/routes/auth.js        login, logout, me, rbac matrix
src/routes/data.js        protected endpoints
tests/security.test.js    401 / 403 / 400 / 404 / 409 / 413 / 429 and token-forgery tests
public/                   the console UI
```

## The pipeline

`trace → requestId → securityHeaders → logger → rateLimit → express.json(10 kB) → authenticate → authorize → validate → handler → errorHandler`

| Status | Meaning | Decided by |
|--------|---------|-----------|
| 401 | not authenticated (missing, malformed, forged, expired, revoked token) | `authenticate` |
| 403 | authenticated but not allowed (missing permission, or order in another city) | `authorize`, route scope check |
| 400 | malformed request (bad query/param/body, unknown field, bad JSON) | `validate`, body parser |
| 404 | no such route or row | handler, `notFound` |
| 409 | valid request, illegal state (for example DELIVERED to PLACED) | handler |
| 413 | body over 10 kB | body parser |
| 429 | too many requests (5 login tries per minute per IP + email; 300 requests per minute per IP) | `rateLimit` |

## Endpoints

| Method | Path | Needs |
|--------|------|-------|
| GET | `/api/health` | public |
| POST | `/api/auth/login` | public (rate limited) |
| GET | `/api/auth/rbac` | public (documents roles) |
| GET | `/api/auth/me`, POST `/api/auth/logout` | any valid token |
| GET | `/api/overview`, `/api/restaurants` | `overview:read` / `restaurants:read` |
| GET | `/api/orders`, `/api/orders/:id` | `orders:read` (+ city scope) |
| PATCH | `/api/orders/:id/status` | `orders:update` (+ city scope, lifecycle rules, row lock) |
| GET | `/api/schema`, `/api/queries` | `schema:read`, `queries:read` |
| GET | `/api/explain/:id` | `explain:run` (admin) |
| GET | `/api/admin/users`, `/api/admin/audit` | `users:read`, `audit:read` (admin) |

## Security decisions worth knowing

- **JWT** is HS256, with the algorithm pinned on both sign and verify, plus issuer, audience, expiry and a `jti`. `alg=none` and algorithm-swap tokens are rejected.
- The token holds only `sub` and `jti`. **Role and scope are looked up server-side per request**, so editing a token's payload cannot raise privileges, and role changes apply immediately.
- **Logout revokes** the `jti` (in-memory denylist; a multi-instance deployment would use Redis).
- Passwords are **bcrypt**-hashed. Login returns the same error for unknown email and wrong password, and compares against a dummy hash for unknown users so timing does not reveal which emails exist.
- **Validation** is declarative and whitelists body fields (blocks mass assignment). All SQL is parameterised (`$1`), and enum filters are validated before they reach SQL.
- **Order updates** run in a transaction with `SELECT … FOR UPDATE` so two concurrent changes cannot both pass the lifecycle check. Timestamp columns are set consistently with the table's CHECK constraints.
- **Errors** leave through one handler. Stack traces, SQL and driver messages are logged server-side and never sent to the client. Every error body carries the `requestId`.
- `X-Middleware-Trace` is a teaching aid for the inspector. Turn it off in production with `TRACE_HEADER=off`.

## Known limits (be upfront about these)

- Users are an in-memory demo store, not a database table. The rate-limit counters and the revocation list are also in memory, so they reset on restart and are per process.
- Tokens are sent as Bearer headers and kept in `sessionStorage`. An httpOnly cookie plus CSRF protection would be the next hardening step.
- No HTTPS in the dev server. `Strict-Transport-Security` is only sent when the request is secure.
