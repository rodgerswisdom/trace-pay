import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

// Any Postgres URL works as-is: Neon, Supabase, Vercel Postgres, RDS, or a local server.
// Paste it into DATABASE_URL; SSL is worked out from the URL. The names Vercel's Neon/Postgres
// integrations create (POSTGRES_URL, or prefixed ones like DATABASE_URL_DATABASE_URL) are picked up too.
const POOLED_VARS = ["DATABASE_URL", "DATABASE_URL_DATABASE_URL", "POSTGRES_URL", "DATABASE_URL_POSTGRES_URL"];
// Direct (non-pooled) URLs, preferred for migrations: PgBouncer-style poolers can't hold session locks.
const DIRECT_VARS = [
  "DATABASE_URL_UNPOOLED",
  "DATABASE_URL_DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL_POSTGRES_URL_NON_POOLING",
  "DIRECT_URL",
];

const firstSet = (names: string[]) => names.map((n) => process.env[n]).find((v) => v && /^postgres(ql)?:\/\//.test(v));
export const databaseUrl = () => firstSet(POOLED_VARS);
export const directDatabaseUrl = () => firstSet(DIRECT_VARS) ?? databaseUrl();

export function poolConfig(url = databaseUrl()): PoolConfig {
  if (!url) throw new Error("DATABASE_URL is not set. Paste your Postgres connection string into .env (or Vercel's env settings).");
  const u = new URL(url);
  const local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname) || u.hostname.endsWith(".local");
  const mode = u.searchParams.get("sslmode");
  // Hosted providers need TLS. Many (e.g. Supabase's pooler) use certificates Node doesn't trust by default,
  // so we encrypt without pinning the CA unless the URL asks for verify-full.
  const ssl = local || mode === "disable" ? false : mode === "verify-full" ? { rejectUnauthorized: true } : { rejectUnauthorized: false };
  u.searchParams.delete("sslmode");
  u.searchParams.delete("channel_binding"); // libpq-only option; node-postgres negotiates SCRAM itself
  return {
    connectionString: u.toString(),
    ssl,
    // Serverless functions each hold a small pool; use your provider's pooled URL where there is one.
    max: process.env.VERCEL ? 3 : 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  };
}

const globalForDb = globalThis as unknown as { pgPool?: Pool };
// One pool per server process (also survives dev hot reloads).
const pool = (globalForDb.pgPool ??= new Pool(poolConfig()));

export const db = drizzle({ client: pool, schema });
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
