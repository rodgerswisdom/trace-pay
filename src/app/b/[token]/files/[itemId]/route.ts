import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { proofFileResponse } from "@/lib/proof-server";

// Buyers only see proof once the exporter has attached (locked) it.
export async function GET(req: Request, { params }: RouteContext<"/b/[token]/files/[itemId]">) {
  const { token, itemId } = await params;
  const deal = await db.query.deals.findFirst({ where: eq(deals.buyerToken, token), columns: { id: true, proofLockedAt: true } });
  if (!deal || !deal.proofLockedAt) return new Response("Not found", { status: 404 });
  return proofFileResponse(deal.id, itemId, new URL(req.url).searchParams.has("download"));
}
