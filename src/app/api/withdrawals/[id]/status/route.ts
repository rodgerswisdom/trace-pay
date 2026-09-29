import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { withdrawals } from "@/db/schema";
import { refreshWithdrawal } from "@/lib/payouts-server";

// Polled by the tracker. Also moves the withdrawal forward from Payaza's side, in case a webhook is missed.
export async function GET(_req: Request, ctx: RouteContext<"/api/withdrawals/[id]/status">) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "signed out" }, { status: 401 });
  const { id } = await ctx.params;
  const w = await db.query.withdrawals.findFirst({ where: and(eq(withdrawals.id, id), eq(withdrawals.exporterId, session.user.id)) });
  if (!w) return Response.json({ error: "not found" }, { status: 404 });
  const now = await refreshWithdrawal(w);
  return Response.json({ version: now.status }, { headers: { "Cache-Control": "no-store" } });
}
