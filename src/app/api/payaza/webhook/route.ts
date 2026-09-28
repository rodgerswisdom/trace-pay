import { confirmPayment } from "@/lib/payments";
import { verifyWebhookSignature } from "@/lib/payaza";

// Payaza collection webhook. We verify the HMAC, then confirmPayment re-checks the transaction
// with Payaza's status query before changing anything, and is idempotent on repeats.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-payaza-signature"))) {
    return Response.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  let body: { merchant_reference?: string; transaction_status?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const ref = body.merchant_reference;
  if (!ref) return Response.json({ ok: true, ignored: "no merchant_reference" });

  const result = await confirmPayment(ref, "webhook");
  return Response.json({ ok: true, result });
}
