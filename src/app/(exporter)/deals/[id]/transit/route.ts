import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { transitFileResponse } from "@/lib/transit-server";

export async function GET(_req: Request, { params }: RouteContext<"/deals/[id]/transit">) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const own = await db.query.deals.findFirst({ where: and(eq(deals.id, id), eq(deals.exporterId, session.user.id)), columns: { id: true } });
  if (!own) return new Response("Not found", { status: 404 });
  return transitFileResponse(id);
}
