import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { proofFileResponse } from "@/lib/proof-server";

export async function GET(req: Request, { params }: RouteContext<"/deals/[id]/files/[itemId]">) {
  const { id, itemId } = await params;
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const own = await db.query.deals.findFirst({ where: and(eq(deals.id, id), eq(deals.exporterId, session.user.id)), columns: { id: true } });
  if (!own) return new Response("Not found", { status: 404 });
  return proofFileResponse(id, itemId, new URL(req.url).searchParams.has("download"));
}
