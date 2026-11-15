import postgres from 'postgres';

// Single shared connection pool for the API gateway.
// Uses the `postgres` npm package (postgres.js) — already in package.json.
const DATABASE_URL = process.env.DATABASE_URL
  ?? (() => { throw new Error('DATABASE_URL is required'); })();

export const sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
  onnotice: () => {},  // suppress advisory notices in logs
});

export default sql;
