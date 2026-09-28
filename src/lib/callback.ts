import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { deals, payments } from "@/db/schema";
import { confirmPayment, type ConfirmResult } from "./payments";

/**
 * Payaza's callback (the buyer coming back from checkout). What the browser says is only a trigger:
 * the payment is confirmed with Payaza's status query on our server before anything changes.
 * The reference must belong to this buyer link's deal.
 */
export async function handleCallback(token: string, reference: string): Promise<{ result: ConfirmResult | "not_found"; kind?: string }> {
  const deal = await db.query.deals.findFirst({ where: eq(deals.buyerToken, token), columns: { id: true } });
  if (!deal || !reference) return { result: "not_found" };
  const payment = await db.query.payments.findFirst({
    where: and(eq(payments.dealId, deal.id), eq(payments.merchantReference, reference)),
    columns: { kind: true },
  });
  if (!payment) return { result: "not_found" };
  return { result: await confirmPayment(reference, "callback"), kind: payment.kind };
}
