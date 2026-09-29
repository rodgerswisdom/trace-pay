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

// ---- Transfers (payouts) ---------------------------------------------------------------------
// From docs.payaza.africa/guides/transfers: POST /payout-receptor/payout, signed with X-Payaza-Signature
// (HMAC-SHA512 of the exact body, base64, secret key). KES rails: "kepss" (bank) and "mobile_money" (M-Pesa).
// The business needs a 6-digit transaction PIN (Dashboard → Settings → Profile → Security), and for live
// payouts Payaza must lift the Post No Debit restriction.

const authHeaders = () => ({
  Authorization: `Payaza ${Buffer.from(env("PAYAZA_PUBLIC_KEY")).toString("base64")}`,
  "X-TenantID": mode() === "Live" ? "live" : "test",
});

/** True when payouts can be sent at all. */
export const payoutsConfigured = () => /^\d{6}$/.test(process.env.PAYAZA_TRANSACTION_PIN ?? "") && !!process.env.PAYAZA_PUBLIC_KEY;

let accountRefCache: { ref: string; at: number } | null = null;

/** Our Payaza account that KES payouts are sent from. PAYAZA_ACCOUNT_REFERENCE overrides the lookup. */
export async function payoutAccountReference(currency = "KES"): Promise<string | null> {
  if (process.env.PAYAZA_ACCOUNT_REFERENCE) return process.env.PAYAZA_ACCOUNT_REFERENCE;
  if (accountRefCache && Date.now() - accountRefCache.at < 60 * 60 * 1000) return accountRefCache.ref;
  const res = await fetch(`${API_BASE}/payaza-account/api/v1/mainaccounts/merchant/enquiry/main`, { headers: authHeaders(), cache: "no-store" });
  const body = (await res.json().catch(() => null)) as { data?: { payazaAccountReference?: string; currency?: string }[] } | null;
  const ref = body?.data?.find((a) => a.currency === currency)?.payazaAccountReference ?? null;
  if (ref) accountRefCache = { ref, at: Date.now() };
  return ref;
}

export type PayoutInput = {
  rail: "kepss" | "mobile_money";
  amountMajor: number; // KES
  accountNumber: string;
  accountName: string;
  bankCode: string;
  reference: string;
  narration: string;
  sender: { name: string; phone: string; address: string };
};

export type PayoutSubmit = { ok: true; raw: unknown } | { ok: false; reason: string; retryable: boolean; raw: unknown };

export async function sendPayout(p: PayoutInput): Promise<PayoutSubmit> {
  const accountReference = await payoutAccountReference("KES");
  if (!accountReference) return { ok: false, reason: "Payaza account not found", retryable: true, raw: null };
  const payload = JSON.stringify({
    transaction_type: p.rail,
    service_payload: {
      payout_amount: p.amountMajor,
      transaction_pin: Number(env("PAYAZA_TRANSACTION_PIN")),
      account_reference: accountReference,
      currency: "KES",
      country: "KEN",
      payout_beneficiaries: [
        {
          credit_amount: p.amountMajor,
          account_number: p.accountNumber,
          account_name: p.accountName,
          bank_code: p.bankCode,
          // 25 characters or less, no special characters.
          narration: p.narration.replace(/[^A-Za-z0-9 ]/g, "").slice(0, 25),
          transaction_reference: p.reference,
          sender: { sender_name: p.sender.name, sender_id: "", sender_phone_number: p.sender.phone, sender_address: p.sender.address },
        },
      ],
    },
  });
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/payout-receptor/payout`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "X-Payaza-Signature": createHmac("sha512", env("PAYAZA_SECRET_KEY")).update(payload, "utf8").digest("base64"),
      },
      body: payload,
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, reason: `Couldn't reach Payaza (${(e as Error).message})`, retryable: true, raw: null };
  }
  const body = (await res.json().catch(() => null)) as {
    response_code?: number | string;
    response_message?: string;
    resp_code?: string;
    response_content?: { response_status?: string; message?: string };
  } | null;
  const accepted = body?.response_content?.response_status === "TRANSACTION_INITIATED" || body?.resp_code === "09" || body?.resp_code === "00";
  if (res.ok && accepted) return { ok: true, raw: body };
  return {
    ok: false,
    reason: body?.response_content?.message ?? body?.response_message ?? `Payaza returned ${res.status}`,
    retryable: res.status >= 500 && !body?.response_message,
    raw: body,
  };
}

export type PayoutStatus = "pending" | "success" | "failed" | "unknown";

/** Transfer status by our transaction_reference. */
export async function queryPayout(reference: string): Promise<{ status: PayoutStatus; payazaReference: string | null; message: string | null; raw: unknown }> {
  const urls = [
    `${API_BASE}/payaza-account/api/v1/mainaccounts/merchant/transaction/${encodeURIComponent(reference)}`,
    `${API_BASE}/payaza-account/api/v1/mainaccounts/transaction/status?transaction_reference=${encodeURIComponent(reference)}`,
  ];
  let last: unknown = null;
  for (const url of urls) {
    const res = await fetch(url, { headers: authHeaders(), cache: "no-store" }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as {
      data?: { transactionStatus?: string; sessionId?: string; responseMessage?: string; transactionReference?: string };
    } | null;
    last = body;
    const s = body?.data?.transactionStatus;
    if (!s) continue;
    return {
      status: s === "NIP_SUCCESS" ? "success" : s === "NIP_FAILURE" ? "failed" : "pending",
      payazaReference: body?.data?.sessionId ?? null,
      message: body?.data?.responseMessage ?? null,
      raw: body,
    };
  }
  return { status: "unknown", payazaReference: null, message: null, raw: last };
}
