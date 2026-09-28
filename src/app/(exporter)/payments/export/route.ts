import { auth } from "@/auth";
import { paymentsLedger } from "@/lib/portfolio";

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Payments ledger as CSV: one row per Payaza-confirmed payment, both currencies, rate and references.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const rows = await paymentsLedger(session.user.id);
  const header = [
    "paid_at_utc",
    "deal",
    "buyer",
    "type",
    "amount",
    "currency",
    "fx_rate_kes",
    "amount_kes",
    "payaza_reference",
    "merchant_reference",
    "status",
    "settlement_reference",
    "settled_at_utc",
  ];
  const lines = rows.map((p) =>
    [
      p.paidAt?.toISOString(),
      p.dealNumber,
      p.buyerCompany,
      p.kind,
      (p.amountMinor / 100).toFixed(2),
      p.currency,
      p.fxRate,
      p.kesAmountMinor != null ? (p.kesAmountMinor / 100).toFixed(2) : "",
      p.payazaReference,
      p.merchantReference,
      p.status,
      p.settlementReference,
      p.settledAt?.toISOString(),
    ]
      .map(csvCell)
      .join(","),
  );
  const body = [header.join(","), ...lines].join("\n") + "\n";
  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="trace-pay-payments-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
