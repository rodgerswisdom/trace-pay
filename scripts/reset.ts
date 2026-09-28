import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

// Empty the database in place and re-run migrations. Deleting the file instead would leave a
// running dev server reading the old, unlinked file.
async function main() {
  const client = createClient({
    url: process.env.DATABASE_URL ?? "file:local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  });
  await client.execute("PRAGMA foreign_keys = OFF");
  const objects = await client.execute(
    "SELECT type, name FROM sqlite_master WHERE type IN ('trigger', 'table') AND name NOT LIKE 'sqlite_%' ORDER BY type = 'table'",
  );
  for (const row of objects.rows) {
    await client.execute(`DROP ${row.type === "trigger" ? "TRIGGER" : "TABLE"} IF EXISTS "${String(row.name)}"`);
  }
  await client.execute("PRAGMA foreign_keys = ON");
  await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  console.log("Database emptied and migrated.");
  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
