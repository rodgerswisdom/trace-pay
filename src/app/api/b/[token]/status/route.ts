import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { sweepPending } from "@/lib/payments";
import { dealVersion } from "@/lib/version";

// Buyer page poll. The token is the only credential; it reveals nothing but a version string.
export async function GET(_req: Request, { params }: RouteContext<"/api/b/[token]/status">) {
  const { token } = await params;
  const deal = await db.query.deals.findFirst({ where: eq(deals.buyerToken, token), columns: { id: true } });
  if (!deal) return Response.json({ error: "not found" }, { status: 404 });
  await sweepPending(deal.id);
  return Response.json({ version: await dealVersion(deal.id) });
}
