import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { sweepPending } from "@/lib/payments";
import { dealVersion } from "@/lib/version";

export async function GET(_req: Request, { params }: RouteContext<"/api/deals/[id]/status">) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "unauthorized" }, { status: 401 });
  const own = await db.query.deals.findFirst({
    where: and(eq(deals.id, id), eq(deals.exporterId, session.user.id)),
    columns: { id: true },
  });
  if (!own) return Response.json({ error: "not found" }, { status: 404 });
  await sweepPending(id);
  return Response.json({ version: await dealVersion(id) });
}
