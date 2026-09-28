import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { claimPhotoResponse } from "@/lib/claims-server";

export async function GET(_req: Request, { params }: RouteContext<"/b/[token]/claims/[claimId]/[n]">) {
  const { token, claimId, n } = await params;
  const deal = await db.query.deals.findFirst({ where: eq(deals.buyerToken, token), columns: { id: true } });
  if (!deal) return new Response("Not found", { status: 404 });
  return claimPhotoResponse(deal, claimId, Number(n));
}
