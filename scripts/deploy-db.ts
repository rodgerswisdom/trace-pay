import "dotenv/config";
import { execSync } from "node:child_process";
import { databaseUrl } from "../src/db";
import { runMigrations } from "./migrate";

// Runs before `next build` on Vercel: migrate, then seed the demo exporter and sample deals if the
// database is empty (the seed is idempotent). All it needs is DATABASE_URL.
async function main() {
  if (!databaseUrl()) {
    throw new Error("DATABASE_URL is not set. Add your Postgres connection string in Vercel → Settings → Environment Variables, then redeploy.");
  }
  await runMigrations();
  console.log("Migrations applied.");
  execSync("tsx scripts/seed.ts", { stdio: "inherit" });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
