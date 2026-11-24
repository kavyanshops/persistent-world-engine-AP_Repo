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


## Evaluation walkthrough

The UI is intentionally arranged for a live backend review: sign-in → operational dashboard → middleware architecture → request inspector → security scenarios → audit and SQL labs.

1. Start PostgreSQL and make sure the `zomato_ap` database is loaded with the project dataset.
2. From `webapp/`, install dependencies and start the API:

   ```bash
   npm install
   export JWT_SECRET='replace-with-a-long-random-local-demo-secret'
   # Set PGPASSWORD if your local PostgreSQL role requires one.
   npm start
   ```

   The default database connection is `localhost:5432`, database `zomato_ap`, and the current OS username. Override it with `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, or `DATABASE_URL` as needed. Open `http://localhost:3000`.

3. Sign in as admin first to show the complete dashboard, order controls, audit events and live EXPLAIN. Use the role shortcuts to switch between manager and analyst:
   - Admin: `admin@zomato.test` / `Admin@12345`
   - Manager: `manager.blr@zomato.test` / `Manager@12345`
   - Analyst: `analyst@zomato.test` / `Analyst@12345`

4. Open browser DevTools → Console. Each API call appears as a collapsed `[API →]` group. Expand it to inspect the request ID, whether a Bearer token was attached, response status, elapsed time, middleware trace, selected security headers and redacted response body. Passwords and JWTs are redacted from console output. The page also keeps the last eight calls in its Live request activity panel.
5. Open DevTools → Network and select an `/api/...` request. Inspect `X-Request-Id` and `X-Middleware-Trace` in Response Headers. The Request Inspector displays the same trace and response body in the page.
6. Run all security scenarios. The suite fires 18 real HTTP requests and compares observed status codes with expected outcomes. For a focused demonstration, use the presets for missing token (401), analyst write attempt (403), malformed query (400), unknown order (404), and forged JWT (401).
7. Switch roles to demonstrate authorization: the manager can read/update only Bengaluru orders; the analyst can read data and query/schema information but cannot update orders; admin can inspect security audit and run read-only `EXPLAIN (ANALYZE, BUFFERS)`.

**Data-changing demo:** the order Update control sends a real `PATCH /api/orders/:id/status`. Choose a listed order and one of its displayed next states. The backend validates the transition and locks the row in a transaction. Use the evaluation dataset only; a successful update persists in PostgreSQL.


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
