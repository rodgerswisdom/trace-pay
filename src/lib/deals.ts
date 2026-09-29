import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { claims, dealDocuments, deals, events, payments, proofItems, readings, transitLogs, type Claim, type Deal, type DealEvent, type Payment } from "@/db/schema";
import { splitTranches } from "./money";

type Actor = DealEvent["actor"];

/** Buyer link token: 32 random bytes, base64url. */
export function newBuyerToken() {
  return randomBytes(32).toString("base64url");
}

/** Our payment reference sent to Payaza, e.g. TP-0926-D-9f3k2a. */
export function newMerchantReference(dealNumber: string, kind: "deposit" | "balance" | "final") {
  return `${dealNumber}-${kind === "deposit" ? "D" : kind === "balance" ? "B" : "F"}-${randomBytes(4).toString("hex")}`;
}

export async function recordEvent(
  tx: Tx | typeof db,
  dealId: string,
  actor: Actor,
  type: string,
  summary: string,
  data?: Record<string, unknown>,
) {
  await tx.insert(events).values({ dealId, actor, type, summary, data });
}

/** Everything a deal page needs, in one go. */
export async function loadDeal(where: { id: string; exporterId: string } | { buyerToken: string }) {
  const deal = await db.query.deals.findFirst({
    where:
      "buyerToken" in where
        ? eq(deals.buyerToken, where.buyerToken)
        : and(eq(deals.id, where.id), eq(deals.exporterId, where.exporterId)),
    with: { exporter: true },
  });
  if (!deal) return null;
  const [dealPayments, dealEvents, dealClaims, dealProof, dealDocumentsList, dealReadings, [transitLog]] = await Promise.all([
    db.select().from(payments).where(eq(payments.dealId, deal.id)).orderBy(asc(payments.createdAt)),
    db.select().from(events).where(eq(events.dealId, deal.id)).orderBy(asc(events.n)),
    db.select().from(claims).where(eq(claims.dealId, deal.id)).orderBy(asc(claims.createdAt)),
    db.select().from(proofItems).where(eq(proofItems.dealId, deal.id)).orderBy(asc(proofItems.createdAt)),
    db.select().from(dealDocuments).where(eq(dealDocuments.dealId, deal.id)).orderBy(asc(dealDocuments.uploadedAt)),
    db.select().from(readings).where(eq(readings.dealId, deal.id)),
    db.select().from(transitLogs).where(eq(transitLogs.dealId, deal.id)),
  ]);
  return {
    deal,
    payments: dealPayments,
    events: dealEvents,
    claims: dealClaims,
    proof: dealProof,
    documents: dealDocumentsList,
    readings: dealReadings,
    transitLog: transitLog ?? null,
  };
}

/**
 * What each tranche is, after any agreed claim reductions. A claim reduces the tranche it was raised
 * against (the next unpaid one at the time).
 */
export function amountsDue(
  deal: Pick<Deal, "totalMinor" | "depositPct" | "finalPct">,
  dealClaims: Pick<Claim, "status" | "agreedAmountMinor" | "appliesTo">[] = [],
) {
  const gross = splitTranches(deal.totalMinor, deal.depositPct, deal.finalPct);
  const reduction = (tranche: "balance" | "final") =>
    dealClaims.filter((c) => c.status !== "open" && c.appliesTo === tranche).reduce((n, c) => n + (c.agreedAmountMinor ?? 0), 0);
  const balanceReduction = reduction("balance");
  const finalReduction = reduction("final");
  return {
    deposit: gross.deposit,
    balance: Math.max(0, gross.balance - balanceReduction),
    final: Math.max(0, gross.final - finalReduction),
    gross,
    balanceReduction,
    finalReduction,
    reduction: balanceReduction + finalReduction,
  };
}

/** The payment the buyer can make now, if any. */
export function nextDue(
  deal: Pick<Deal, "status" | "totalMinor" | "depositPct" | "finalPct" | "arrivedAt">,
  paid: Pick<Payment, "kind" | "status">[],
  dealClaims: Pick<Claim, "status" | "agreedAmountMinor" | "appliesTo">[],
): { kind: Payment["kind"]; amountMinor: number } | null {
  const due = amountsDue(deal, dealClaims);
  const has = (k: Payment["kind"]) => paid.some((p) => p.kind === k && p.status !== "pending");
  if (deal.status === "awaiting_deposit") return { kind: "deposit", amountMinor: due.deposit };
  if ((deal.status === "proof_attached" || deal.status === "balance_agreed") && !has("balance") && due.balance > 0) {
    return { kind: "balance", amountMinor: due.balance };
  }
  if ((deal.status === "final_due" || deal.status === "balance_agreed") && has("balance") && !has("final") && due.final > 0 && deal.arrivedAt) {
    return { kind: "final", amountMinor: due.final };
  }
  return null;
}

export { fmtDateEAT, fmtTimeEAT } from "./time";
