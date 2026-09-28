import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { transitFileResponse } from "@/lib/transit-server";

export async function GET(_req: Request, { params }: RouteContext<"/b/[token]/transit">) {
  const { token } = await params;
  const deal = await db.query.deals.findFirst({ where: eq(deals.buyerToken, token), columns: { id: true } });
  if (!deal) return new Response("Not found", { status: 404 });
  return transitFileResponse(deal.id);
}
