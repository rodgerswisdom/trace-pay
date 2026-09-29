import { eq } from "drizzle-orm";
import { db } from "@/db";
import { withdrawals } from "@/db/schema";
import { confirmPayment } from "@/lib/payments";
import { verifyWebhookSignature } from "@/lib/payaza";
import { refreshWithdrawal } from "@/lib/payouts-server";

// Payaza webhook, for collections (a buyer paid) and transfers (a withdrawal landed or failed).
// We verify the HMAC, then re-check with Payaza's status query before changing anything. Idempotent on repeats.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-payaza-signature"))) {
    return Response.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  let body: { merchant_reference?: string; transaction_reference?: string; transaction_type?: string; transaction_status?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  // Transfer: DEBIT with our transaction_reference.
  if (body.transaction_type === "DEBIT" && body.transaction_reference) {
    const w = await db.query.withdrawals.findFirst({ where: eq(withdrawals.reference, body.transaction_reference) });
    if (!w) return Response.json({ ok: true, ignored: "unknown transfer" });
    // The signed body is the fallback if the status query can't answer.
    const hint = body.transaction_status === "NIP_SUCCESS" ? "success" : body.transaction_status === "NIP_FAILURE" ? "failed" : undefined;
    const now = await refreshWithdrawal(w, hint);
    return Response.json({ ok: true, withdrawal: now.status });
  }

  const ref = body.merchant_reference;
  if (!ref) return Response.json({ ok: true, ignored: "no merchant_reference" });

  const result = await confirmPayment(ref, "webhook");
  return Response.json({ ok: true, result });
}
