import "dotenv/config";
import { Client } from "pg";
import { databaseUrl, directDatabaseUrl, poolConfig } from "../src/db";

// `pnpm db:check`: can we reach the database, over the pooled and the direct URL?
async function check(label: string, url: string | undefined) {
  if (!url) return console.log(`${label}: not set`);
  const host = new URL(url).hostname;
  const c = new Client(poolConfig(url));
  try {
    await c.connect();
    const r = await c.query(
      "select split_part(version(), ',', 1) as v, current_database() as db, (select count(*) from information_schema.tables where table_schema='public')::int as tables",
    );
    console.log(`${label}: OK · ${host} · ${r.rows[0].v} · database ${r.rows[0].db} · ${r.rows[0].tables} tables`);
  } catch (e) {
    console.log(`${label}: FAILED · ${host} · ${(e as Error).message}`);
    process.exitCode = 1;
  } finally {
    await c.end().catch(() => {});
  }
}

check("app (pooled)", databaseUrl())
  .then(() => check("migrations (direct)", directDatabaseUrl()))
  .then(() => process.exit(process.exitCode ?? 0));
