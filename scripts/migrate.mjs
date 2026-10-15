// Minimal forward-only migration runner. Usage: node scripts/migrate.mjs
// Runs db/migrations/*.sql in filename order, each inside a transaction, and
// records applied files in schema_migrations. An advisory lock stops two
// containers migrating at once.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(727274)");
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    console.log("applying", file);
    await client.query("BEGIN");
    try {
      await client.query(fs.readFileSync(path.join(dir, file), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; }
  }
  console.log("migrations up to date");
} finally {
  await client.query("SELECT pg_advisory_unlock(727274)").catch(() => {});
  await client.end();
}
