import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Local SQLite file by default. Point DATABASE_URL at a Turso (libsql://) URL for a hosted deploy.
const client = createClient({
  url: process.env.DATABASE_URL ?? "file:local.db",
  authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
});

export const db = drizzle({ client, schema });
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
