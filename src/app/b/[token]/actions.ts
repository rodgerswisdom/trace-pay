"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { loadDeal, nextDue } from "@/lib/deals";
import { checkoutUrl } from "@/lib/payaza";
import { pendingPaymentFor } from "@/lib/payments";
import { normalizePhone } from "@/lib/phone";
import { buyerLink } from "@/lib/urls";

/**
 * Buyer taps the pay button: work out what's due now (deposit, balance or final tranche, after any
 * agreed claim), create or reuse our payment, then send them to Payaza's checkout.
 */
export async function payNext(token: string, form: FormData) {
  const data = await loadDeal({ buyerToken: token });
  if (!data) redirect("/");
  const { deal, claims, payments } = data;
  const due = nextDue(deal, payments, claims);
  if (!due) redirect(`/b/${token}`);

  // Payaza's card checkout needs the payer's phone. Use the deal's, or ask the buyer for it.
  let phone = deal.buyerPhone;
  if (!phone) {
    phone = normalizePhone(String(form.get("phone") ?? ""));
    if (!phone) redirect(`/b/${token}?phone=invalid`);
    await db.update(deals).set({ buyerPhone: phone }).where(eq(deals.id, deal.id));
  }

  const payment = await pendingPaymentFor(deal, due.kind, due.amountMinor);
  if (payment === "already_paid") redirect(`/b/${token}`);

  redirect(
    checkoutUrl({
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      email: deal.buyerEmail,
      name: deal.buyerContact,
      phone,
      reference: payment.merchantReference,
      redirectUrl: `${buyerLink(token)}?returned=${due.kind}`,
      details: { deal: deal.number, kind: due.kind },
    }),
  );
}
