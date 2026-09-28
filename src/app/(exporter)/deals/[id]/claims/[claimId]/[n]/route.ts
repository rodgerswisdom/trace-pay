import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { claimPhotoResponse } from "@/lib/claims-server";

export async function GET(_req: Request, { params }: RouteContext<"/deals/[id]/claims/[claimId]/[n]">) {
  const { id, claimId, n } = await params;
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const deal = await db.query.deals.findFirst({ where: and(eq(deals.id, id), eq(deals.exporterId, session.user.id)), columns: { id: true } });
  if (!deal) return new Response("Not found", { status: 404 });
  return claimPhotoResponse(deal, claimId, Number(n));
}
