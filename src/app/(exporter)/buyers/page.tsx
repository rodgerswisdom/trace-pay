import Link from "next/link";
import { LockIcon } from "lucide-react";
import { requireExporter } from "@/auth";
import { StatusChip } from "@/components/status-chip";
import { fmtDateEAT } from "@/lib/deals";
import { t } from "@/lib/i18n";
import { fmt } from "@/lib/money";
import { buyerKey, isPaid, loadPortfolio, type DealWithMoney } from "@/lib/portfolio";

// Each buyer's history with this exporter only. Derived from this exporter's own deals;
// nothing here is a score, and nothing is shared with anyone else.

type Buyer = { key: string; company: string; contact: string; email: string; deals: DealWithMoney[] };

const sumBy = (items: { currency: string; amount: number }[]) => {
  const m = new Map<string, number>();
  for (const i of items) m.set(i.currency, (m.get(i.currency) ?? 0) + i.amount);
  return [...m].map(([c, v]) => fmt(v, c)).join(" · ");
};

export default async function BuyersPage() {
  const exporter = await requireExporter();
  const s = t(exporter.language);
  const b = s.buyersList;
  const portfolio = await loadPortfolio(exporter.id);

  const buyers = new Map<string, Buyer>();
  for (const d of portfolio) {
    const key = buyerKey(d);
    const entry = buyers.get(key) ?? { key, company: d.buyerCompany, contact: d.buyerContact, email: d.buyerEmail, deals: [] };
    entry.deals.push(d); // portfolio is newest first, so the first deal seen has the latest name
    buyers.set(key, entry);
  }
  const list = [...buyers.values()].sort((x, y) => y.deals[0].createdAt.getTime() - x.deals[0].createdAt.getTime());

  return (
    <main className="flex flex-1 flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-2xl font-semibold md:text-3xl">{b.title}</h1>
        <p className="mt-2 flex max-w-2xl items-start gap-2 text-sm text-muted-foreground">
          <LockIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          {b.privacy}
        </p>
      </div>

      {list.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-muted-foreground">{b.empty}</p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {list.map((buyer) => {
            const live = buyer.deals.filter((d) => d.status !== "cancelled");
            const kg = live.reduce((n, d) => n + d.weightKg, 0);
            const value = sumBy(live.map((d) => ({ currency: d.currency, amount: d.totalMinor })));
            const paid = sumBy(buyer.deals.flatMap((d) => d.payments.filter(isPaid).map((p) => ({ currency: p.currency, amount: p.amountMinor }))));
            const claims = buyer.deals.flatMap((d) => d.claims);
            const claimSummary =
              claims.length === 0
                ? b.none
                : [
                    ["open", s.claimsList.open],
                    ["accepted", s.claimsList.accepted],
                    ["countered", s.claimsList.countered],
                    ["rejected", s.claimsList.rejected],
                  ]
                    .map(([st, label]) => [claims.filter((c) => c.status === st).length, label] as const)
                    .filter(([n]) => n > 0)
                    .map(([n, label]) => `${n} ${label.toLowerCase()}`)
                    .join(" · ");

            return (
              <li key={buyer.key} className="flex flex-col rounded-xl border">
                <div className="p-4 md:p-5">
                  <p className="text-lg font-semibold">{buyer.company}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {buyer.contact} · {buyer.email}
                  </p>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <Stat term={`${buyer.deals.length} ${buyer.deals.length === 1 ? b.deal : b.deals}`} value={`${b.last}: ${fmtDateEAT(buyer.deals[0].createdAt)}`} />
                    <Stat term={b.volume} value={`${kg.toLocaleString("en-US")} kg`} />
                    <Stat term={b.value} value={value || "—"} />
                    <Stat term={b.paid} value={paid || "—"} />
                    <div className="col-span-2">
                      <Stat term={b.claims} value={claimSummary} />
                    </div>
                  </dl>
                </div>
                <ul className="mt-auto divide-y border-t">
                  {buyer.deals.map((d) => (
                    <li key={d.id}>
                      <Link href={`/deals/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50 md:px-5">
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{d.number}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            · {d.weightKg.toLocaleString("en-US")} kg · {fmt(d.totalMinor, d.currency)}
                          </span>
                        </span>
                        <StatusChip status={d.status} label={s.status[d.status]} className="shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function Stat({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
