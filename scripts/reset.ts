import "dotenv/config";
import { Client } from "pg";
import { directDatabaseUrl, poolConfig } from "../src/db";
import { runMigrations } from "./migrate";

// Wipe everything (all tables, the migrations record) and migrate from scratch. Local/demo use only.
async function main() {
  if (process.env.VERCEL_ENV === "production" && process.env.ALLOW_RESET !== "1") throw new Error("Refusing to reset a production database.");
  const client = new Client(poolConfig(directDatabaseUrl()));
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await client.end();
  await runMigrations();
  console.log("Database emptied and migrated.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
