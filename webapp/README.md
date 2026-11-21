# Zomato Ops Dashboard

A small Node.js and Express dashboard backed by the local `zomato_ap` PostgreSQL database.

## Run

From this directory:

```bash
npm install
npm start
```

Open http://localhost:3000.

The app defaults to PostgreSQL database `zomato_ap` on `localhost:5432` and uses the current macOS user as `PGUSER`. Override connection settings with the usual `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, or `DATABASE_URL` environment variables.
