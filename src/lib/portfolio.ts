import "server-only";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { claims, deals, events, payments, type Claim, type Deal, type Payment, type Reading, type TransitLog } from "@/db/schema";

// Exporter-wide reads for the sidebar tabs. Deal counts per exporter are small (tens, not thousands),
// so we load deals with their payments and claims once and derive everything in memory.

export type DealWithMoney = Deal & { payments: Payment[]; claims: Claim[]; readings: Reading[]; transitLog: TransitLog | null };

export async function loadPortfolio(exporterId: string): Promise<DealWithMoney[]> {
  return db.query.deals.findMany({
    where: eq(deals.exporterId, exporterId),
    orderBy: desc(deals.createdAt),
    with: { payments: true, claims: true, readings: true, transitLog: true },
  });
}

/** Where the exporter has to act next. */
export const NEEDS_EXPORTER = ["deposit_paid", "claim_open"] as const;

export const isPaid = (p: Payment) => p.status === "paid" || p.status === "settled";

/** Balance reduction agreed through resolved claims. */
export const agreedReduction = (d: DealWithMoney) =>
  d.claims.filter((c) => c.status !== "open").reduce((n, c) => n + (c.agreedAmountMinor ?? 0), 0);

/** What's still owed on a live deal, in the deal currency. */
export function outstanding(d: DealWithMoney) {
  if (d.status === "cancelled") return 0;
  const received = d.payments.filter(isPaid).reduce((n, p) => n + p.amountMinor, 0);
  return Math.max(0, d.totalMinor - agreedReduction(d) - received);
}

/** Counts shown on the sidebar tabs. */
export async function navCounts(exporterId: string) {
  const [[needsYou], [openClaims]] = await Promise.all([
    db
      .select({ n: count() })
      .from(deals)
      .where(and(eq(deals.exporterId, exporterId), inArray(deals.status, [...NEEDS_EXPORTER]))),
    db
      .select({ n: count() })
      .from(claims)
      .innerJoin(deals, eq(claims.dealId, deals.id))
      .where(and(eq(deals.exporterId, exporterId), eq(claims.status, "open"))),
  ]);
  return { needsYou: needsYou.n, openClaims: openClaims.n };
}

/** Latest timeline events across all of an exporter's deals. */
export async function recentEvents(exporterId: string, limit = 8) {
  return db
    .select({
      id: events.id,
      actor: events.actor,
      summary: events.summary,
      createdAt: events.createdAt,
      dealId: deals.id,
      dealNumber: deals.number,
      buyerCompany: deals.buyerCompany,
    })
    .from(events)
    .innerJoin(deals, eq(events.dealId, deals.id))
    .where(eq(deals.exporterId, exporterId))
    .orderBy(desc(events.createdAt))
    .limit(limit);
}

/** Stage filter chips on the Deals tab. "paid" groups balance_paid and settled. */
export const STAGES = [
  { key: "awaiting_deposit", statuses: ["awaiting_deposit"] },
  { key: "deposit_paid", statuses: ["deposit_paid"] },
  { key: "proof_attached", statuses: ["proof_attached"] },
  { key: "claim_open", statuses: ["claim_open"] },
  { key: "balance_agreed", statuses: ["balance_agreed"] },
  { key: "awaiting_arrival", statuses: ["awaiting_arrival"] },
  { key: "final_due", statuses: ["final_due"] },
  { key: "paid", statuses: ["balance_paid", "settled"] },
  { key: "cancelled", statuses: ["cancelled"] },
] as const;
export type StageKey = (typeof STAGES)[number]["key"];

/** Buyers are grouped by email: one buyer, one history with this exporter. */
export const buyerKey = (d: Pick<Deal, "buyerEmail">) => d.buyerEmail.toLowerCase();

/** Payaza-confirmed payments across all deals, newest first. */
export async function paymentsLedger(exporterId: string) {
  const rows = await db
    .select({ payment: payments, dealId: deals.id, dealNumber: deals.number, buyerCompany: deals.buyerCompany })
    .from(payments)
    .innerJoin(deals, eq(payments.dealId, deals.id))
    .where(and(eq(deals.exporterId, exporterId), inArray(payments.status, ["paid", "settled"])))
    .orderBy(desc(payments.paidAt));
  return rows.map((r) => ({ ...r.payment, dealId: r.dealId, dealNumber: r.dealNumber, buyerCompany: r.buyerCompany }));
}
