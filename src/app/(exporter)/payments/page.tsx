import Link from "next/link";
import { DownloadIcon } from "lucide-react";
import { requireExporter } from "@/auth";
import { buttonVariants } from "@/components/ui/button";
import { fmtDateEAT, fmtTimeEAT } from "@/lib/deals";
import { t } from "@/lib/i18n";
import { fmt } from "@/lib/money";
import { paymentsLedger } from "@/lib/portfolio";
import { cn } from "@/lib/utils";

export default async function PaymentsPage() {
  const exporter = await requireExporter();
  const s = t(exporter.language).pay;
  const rows = await paymentsLedger(exporter.id);

  const byCurrency = new Map<string, number>();
  let kesTotal = 0;
  for (const p of rows) {
    byCurrency.set(p.currency, (byCurrency.get(p.currency) ?? 0) + p.amountMinor);
    kesTotal += p.kesAmountMinor ?? 0;
  }
  const kes = (minor: number | null) => (minor == null ? "—" : fmt(Math.round(minor / 100) * 100, "KES"));
  const statusLabel = (st: string) => (st === "settled" ? s.settled : s.paid);

  return (
    <main className="flex flex-1 flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">{s.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{s.intro}</p>
        </div>
        {rows.length > 0 && (
          <a href="/payments/export" download className={cn(buttonVariants({ variant: "outline" }), "h-12 gap-2 px-4 text-base sm:h-10 sm:text-sm")}>
            <DownloadIcon className="size-4" />
            {s.export}
          </a>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-muted-foreground">{s.empty}</p>
      ) : (
        <>
          <div className="rounded-xl border bg-muted/30 p-4 text-sm md:text-base">
            <span className="text-muted-foreground">{s.totalReceived}: </span>
            <span className="font-semibold">
              {[...byCurrency].map(([c, v]) => fmt(v, c)).join(" · ")} · {kes(kesTotal)}
            </span>
          </div>

          {/* Phones: one card per payment */}
          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map((p) => (
              <li key={p.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/deals/${p.dealId}`} className="font-medium underline-offset-4 hover:underline">
                      {p.dealNumber} · {p.kind === "deposit" ? s.deposit : s.balance}
                    </Link>
                    <p className="truncate text-sm text-muted-foreground">{p.buyerCompany}</p>
                  </div>
                  <StatusPill status={p.status} label={statusLabel(p.status)} />
                </div>
                <p className="mt-2 font-medium">
                  {fmt(p.amountMinor, p.currency)} · {kes(p.kesAmountMinor)}
                </p>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <dt>{s.rate}</dt>
                  <dd>{p.fxRate ? `1 ${p.currency} = ${p.fxRate} KES` : "—"}</dd>
                  <dt>{s.reference}</dt>
                  <dd className="font-mono break-all">{p.payazaReference}</dd>
                  {p.settlementReference && (
                    <>
                      <dt>{s.settlementRef}</dt>
                      <dd className="font-mono break-all">{p.settlementReference}</dd>
                    </>
                  )}
                  <dt>{s.date}</dt>
                  <dd>{p.paidAt ? fmtTimeEAT(p.paidAt) : "—"}</dd>
                </dl>
              </li>
            ))}
          </ul>

          {/* Tablets and up: a ledger table */}
          <div className="hidden overflow-x-auto rounded-xl border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">{s.date}</th>
                  <th className="px-4 py-3 font-semibold">{s.deal}</th>
                  <th className="px-4 py-3 font-semibold">{s.kind}</th>
                  <th className="px-4 py-3 text-right font-semibold">{s.amount}</th>
                  <th className="px-4 py-3 text-right font-semibold">{s.rate}</th>
                  <th className="px-4 py-3 text-right font-semibold">{s.kes}</th>
                  <th className="px-4 py-3 font-semibold">{s.reference}</th>
                  <th className="px-4 py-3 font-semibold">{s.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((p) => (
                  <tr key={p.id} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap">{p.paidAt ? fmtDateEAT(p.paidAt) : "—"}</td>
                    <td className="px-4 py-3">
                      <Link href={`/deals/${p.dealId}`} className="font-medium underline-offset-4 hover:underline">
                        {p.dealNumber}
                      </Link>
                      <div className="max-w-48 truncate text-xs text-muted-foreground">{p.buyerCompany}</div>
                    </td>
                    <td className="px-4 py-3">{p.kind === "deposit" ? s.deposit : s.balance}</td>
                    <td className="px-4 py-3 text-right font-medium whitespace-nowrap">{fmt(p.amountMinor, p.currency)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-muted-foreground">{p.fxRate ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium whitespace-nowrap">{kes(p.kesAmountMinor)}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {p.payazaReference}
                      {p.settlementReference && (
                        <div className="text-muted-foreground">
                          {s.settlementRef}: {p.settlementReference}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={p.status} label={statusLabel(p.status)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">{s.rateNote}</p>
        </>
      )}
    </main>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        status === "settled"
          ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
          : "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
