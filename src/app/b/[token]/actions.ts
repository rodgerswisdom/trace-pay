"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { loadDeal, nextDue } from "@/lib/deals";
import { checkoutSdkOptions, checkoutUrl, type CheckoutInput } from "@/lib/payaza";
import { pendingPaymentFor } from "@/lib/payments";
import { normalizePhone } from "@/lib/phone";
import { buyerLink } from "@/lib/urls";

type Prepared = { ok: true; checkout: CheckoutInput; kind: "deposit" | "balance" | "final" } | { ok: false; reason: "nothing_due" | "phone" | "not_found" };

/**
 * Work out what's due now (deposit, balance or final tranche, after any agreed claim), make sure we have
 * the buyer's phone, and create or reuse our payment for it.
 */
async function prepare(token: string, phoneInput: string | null): Promise<Prepared> {
  const data = await loadDeal({ buyerToken: token });
  if (!data) return { ok: false, reason: "not_found" };
  const { deal, claims, payments } = data;
  const due = nextDue(deal, payments, claims);
  if (!due) return { ok: false, reason: "nothing_due" };

  // Payaza's card checkout needs the payer's phone. Use the deal's, or ask the buyer for it.
  let phone = deal.buyerPhone;
  if (!phone) {
    phone = normalizePhone(phoneInput ?? "");
    if (!phone) return { ok: false, reason: "phone" };
    await db.update(deals).set({ buyerPhone: phone }).where(eq(deals.id, deal.id));
  }

  const payment = await pendingPaymentFor(deal, due.kind, due.amountMinor);
  if (payment === "already_paid") return { ok: false, reason: "nothing_due" };

  return {
    ok: true,
    kind: due.kind,
    checkout: {
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      email: deal.buyerEmail,
      name: deal.buyerContact,
      phone,
      reference: payment.merchantReference,
      // Payaza returns the buyer here without adding anything, so our reference travels in the URL.
      redirectUrl: `${buyerLink(token)}/callback?ref=${encodeURIComponent(payment.merchantReference)}`,
      details: { deal: deal.number, kind: due.kind },
    },
  };
}

/** Without JavaScript (or if the SDK can't load): send the buyer to Payaza's hosted payment page. */
export async function payNext(token: string, form: FormData) {
  const r = await prepare(token, form.get("phone") ? String(form.get("phone")) : null);
  if (!r.ok) redirect(r.reason === "phone" ? `/b/${token}?phone=invalid` : `/b/${token}`);
  redirect(checkoutUrl(r.checkout));
}

/** With JavaScript: the options for Payaza's inline checkout, plus the hosted page as a fallback. */
export async function startPayment(token: string, phone: string | null) {
  const r = await prepare(token, phone);
  if (!r.ok) return r;
  return { ok: true as const, kind: r.kind, reference: r.checkout.reference, options: checkoutSdkOptions(r.checkout), fallbackUrl: checkoutUrl(r.checkout) };
}
