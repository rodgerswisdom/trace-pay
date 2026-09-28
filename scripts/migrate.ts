import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { directDatabaseUrl, poolConfig } from "../src/db";

// Applies pending migrations. Safe to run on every deploy: already-applied migrations are skipped, and an
// advisory lock stops two builds migrating at the same time.
export async function runMigrations() {
  const client = new Client(poolConfig(directDatabaseUrl()));
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(7465726163)"); // "trace" as a number
    await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  } finally {
    await client.query("SELECT pg_advisory_unlock(7465726163)").catch(() => {});
    await client.end();
  }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  runMigrations()
    .then(() => {
      console.log("Migrations applied.");
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
