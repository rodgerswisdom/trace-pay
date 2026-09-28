import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { claims, deals, payments, type Deal, type Payment } from "@/db/schema";
import { amountsDue, newMerchantReference, recordEvent } from "./deals";
import { both, kesRate, toKesMinor } from "./money";
import { queryStatus } from "./payaza";

export type ConfirmResult = "paid" | "pending" | "failed" | "mismatch";

/**
 * Confirm a payment from Payaza's side. Called by the webhook and by the buyer page's status poll;
 * both go through Payaza's status query, so a forged webhook or a bare redirect can't mark anything paid.
 * Idempotent: only the call that flips pending → paid writes events.
 */
export async function confirmPayment(merchantReference: string, via: "webhook" | "status_check" | "callback"): Promise<ConfirmResult> {
  const payment = await db.query.payments.findFirst({ where: eq(payments.merchantReference, merchantReference) });
  if (!payment) return "failed";
  if (payment.status !== "pending") return "paid";

  const q = await queryStatus(merchantReference);
  if (q.status === "Failed") return "failed";
  if (q.status !== "Completed") return "pending";

  const expected = payment.amountMinor / 100;
  const currencyOk = !q.currency || q.currency.toUpperCase() === payment.currency;
  if (!currencyOk || q.amountReceived == null || q.amountReceived + 0.005 < expected) {
    console.error("Payaza amount/currency mismatch", { merchantReference, q });
    return "mismatch";
  }

  const rate = kesRate(payment.currency);
  const kesMinor = toKesMinor(payment.amountMinor, rate);

  return db.transaction(async (tx): Promise<ConfirmResult> => {
    const [updated] = await tx
      .update(payments)
      .set({
        status: "paid",
        payazaReference: q.payazaReference ?? `${merchantReference}:confirmed`,
        fxRate: rate,
        kesAmountMinor: kesMinor,
        paidAt: new Date(),
      })
      .where(and(eq(payments.id, payment.id), eq(payments.status, "pending")))
      .returning();
    if (!updated) return "paid"; // another confirmation got here first

    const [deal] = await tx.select().from(deals).where(eq(deals.id, payment.dealId));
    const amount = both(payment.amountMinor, payment.currency, rate);
    const ref = updated.payazaReference;

    if (payment.kind === "deposit") {
      await tx.update(deals).set({ status: "deposit_paid" }).where(eq(deals.id, deal.id));
      await recordEvent(tx, deal.id, "payaza", "deposit_paid", `Buyer paid deposit · ${amount}`, { ref, merchantReference, via });
    } else {
      const label = payment.kind === "final" ? "final payment" : "balance";
      await recordEvent(tx, deal.id, "payaza", `${payment.kind}_paid`, `Buyer paid ${label} · ${amount}`, { ref, merchantReference, via });
      // Test-mode payments are not settled by Payaza, so we record initiation only.
      await recordEvent(tx, deal.id, "payaza", "settlement_initiated", `Settlement initiated to exporter · KES ${(kesMinor / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })} (estimate)`, { ref });

      // What's next: the final tranche on arrival, or paid in full.
      const dealClaims = await tx.select().from(claims).where(eq(claims.dealId, deal.id));
      const finalDue = payment.kind === "balance" ? amountsDue(deal, dealClaims).final : 0;
      let next: Deal["status"] = "balance_paid";
      if (finalDue > 0) next = deal.arrivedAt ? "final_due" : "awaiting_arrival";
      await tx.update(deals).set({ status: next }).where(eq(deals.id, deal.id));
      if (next === "final_due") {
        await recordEvent(tx, deal.id, "system", "final_requested", `Final payment requested from buyer · ${both(finalDue, deal.currency, rate)}`);
      }
    }
    return "paid";
  });
}

/** Get (or create) the pending payment the buyer should pay now. Returns null if nothing is due. */
export async function pendingPaymentFor(deal: Deal, kind: Payment["kind"], amountMinor: number): Promise<Payment | "already_paid"> {
  const existing = await db.query.payments.findMany({
    where: and(eq(payments.dealId, deal.id), eq(payments.kind, kind)),
  });
  if (existing.some((p) => p.status !== "pending")) return "already_paid";

  // Reuse the latest pending attempt for the same amount, unless Payaza says it failed.
  const reusable = existing.filter((p) => p.amountMinor === amountMinor).at(-1);
  if (reusable) {
    const result = await confirmPayment(reusable.merchantReference, "status_check");
    if (result === "paid") return "already_paid";
    if (result === "pending") return reusable;
  }

  const [created] = await db
    .insert(payments)
    .values({
      dealId: deal.id,
      kind,
      amountMinor,
      currency: deal.currency,
      merchantReference: newMerchantReference(deal.number, kind),
    })
    .returning();
  return created;
}

const lastChecked = new Map<string, number>();

/**
 * Backstop for a missed webhook: check this deal's recent pending payments with Payaza,
 * at most once every 10s per payment. Called from the status polls.
 */
export async function sweepPending(dealId: string) {
  const pending = await db.query.payments.findMany({
    where: and(eq(payments.dealId, dealId), eq(payments.status, "pending")),
  });
  const now = Date.now();
  await Promise.all(
    pending
      .filter((p) => now - p.createdAt.getTime() < 2 * 60 * 60 * 1000)
      .filter((p) => now - (lastChecked.get(p.merchantReference) ?? 0) > 10_000)
      .map((p) => {
        lastChecked.set(p.merchantReference, now);
        return confirmPayment(p.merchantReference, "status_check").catch((e) => console.error("sweep", e));
      }),
  );
}
