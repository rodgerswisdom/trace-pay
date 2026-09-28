import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Payaza integration, from docs.payaza.africa:
// - Checkout: hosted Payment Page (payment.payaza.africa) with our transaction_reference and a redirect_url.
// - Confirmation: collection webhook signed with x-payaza-signature (HMAC-SHA512, base64, secret key),
//   and the merchant-reference status query. We never trust the redirect alone.
// - Test mode: same base URL; only the key and connection_mode / X-TenantID differ.

const API_BASE = "https://api.payaza.africa/live";
const PAYMENT_PAGE = "https://payment.payaza.africa/";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

const mode = () => (process.env.PAYAZA_MODE === "Live" ? "Live" : "Test");

export type CheckoutInput = {
  amountMinor: number;
  currency: string;
  email: string;
  name: string;
  /** E.164. Required: Payaza's card 3-D Secure check rejects an empty phone. */
  phone: string;
  reference: string;
  redirectUrl: string;
  details?: Record<string, string>;
};

/** Options for Payaza's Web Checkout SDK (inline modal). Only the public key is included. */
export function checkoutSdkOptions(p: CheckoutInput) {
  const [first, ...rest] = p.name.trim().split(/\s+/);
  return {
    merchant_key: env("PAYAZA_PUBLIC_KEY"),
    connection_mode: mode(),
    checkout_amount: Number((p.amountMinor / 100).toFixed(2)),
    currency_code: p.currency,
    email_address: p.email,
    first_name: first || "Buyer",
    last_name: rest.join(" ") || first || "Buyer",
    phone_number: p.phone,
    transaction_reference: p.reference,
    additional_details: p.details ?? {},
  };
}

export function checkoutUrl(p: {
  amountMinor: number;
  currency: string;
  email: string;
  name: string;
  /** E.164. Required: Payaza's card 3-D Secure check rejects an empty phone. */
  phone: string;
  reference: string;
  redirectUrl: string;
  details?: Record<string, string>;
}) {
  const [first, ...rest] = p.name.trim().split(/\s+/);
  const params = new URLSearchParams({
    merchant_key: env("PAYAZA_PUBLIC_KEY"),
    connection_mode: mode(),
    checkout_amount: (p.amountMinor / 100).toFixed(2),
    currency_code: p.currency,
    email_address: p.email,
    first_name: first || "Buyer",
    last_name: rest.join(" ") || first || "Buyer",
    phone_number: p.phone,
    transaction_reference: p.reference,
  });
  if (p.details) params.set("additional_details", JSON.stringify(p.details));
  // Payaza requires redirect_url to be the last parameter.
  params.set("redirect_url", p.redirectUrl);
  return `${PAYMENT_PAGE}?${params.toString()}`;
}

export type PayazaStatus = {
  status: "Initialized" | "Completed" | "Failed" | "NotFound";
  payazaReference: string | null;
  amountReceived: number | null; // major units
  currency: string | null;
  raw: unknown;
};

/** Server-side status check by our merchant reference. */
export async function queryStatus(merchantReference: string): Promise<PayazaStatus> {
  const url = `${API_BASE}/merchant-collection/transfer_notification_controller/merchant/transaction-query?merchant_reference=${encodeURIComponent(merchantReference)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Payaza ${Buffer.from(env("PAYAZA_PUBLIC_KEY")).toString("base64")}`,
      "X-TenantID": mode() === "Live" ? "live" : "test",
    },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: {
      transaction_status?: string;
      transaction_reference?: string | null;
      session_id?: string | null;
      amount_received?: number;
      currency?: string;
    };
  } | null;
  const d = body?.data;
  if (!res.ok || !d) return { status: "NotFound", payazaReference: null, amountReceived: null, currency: null, raw: body };
  const s = d.transaction_status;
  return {
    status: s === "Completed" || s === "Failed" || s === "Initialized" ? s : "Initialized",
    // transaction_reference can be null on card payments; fall back to the session id.
    payazaReference: d.transaction_reference ?? d.session_id ?? null,
    amountReceived: d.amount_received ?? null,
    currency: d.currency ?? null,
    raw: body,
  };
}

export function verifyWebhookSignature(rawBody: string, signature: string | null) {
  if (!signature) return false;
  const expected = createHmac("sha512", env("PAYAZA_SECRET_KEY")).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
