import "server-only";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { deals, events } from "@/db/schema";

/** Changes whenever the deal's status changes or a timeline event is added. */
export async function dealVersion(dealId: string) {
  const [[d], [e]] = await Promise.all([
    db.select({ status: deals.status }).from(deals).where(eq(deals.id, dealId)),
    db.select({ n: count() }).from(events).where(eq(events.dealId, dealId)),
  ]);
  return d ? `${d.status}:${e.n}` : null;
}
