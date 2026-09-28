import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { requireExporter } from "@/auth";
import { StatusChip } from "@/components/status-chip";
import { fmtTimeEAT } from "@/lib/deals";
import { t } from "@/lib/i18n";
import { sectionTitle } from "@/lib/layout";
import { fmt, fmtKesShort, kesRate, toKesMinor } from "@/lib/money";
import { NEEDS_EXPORTER, loadPortfolio, outstanding, recentEvents } from "@/lib/portfolio";
import { cn } from "@/lib/utils";

export default async function HomePage() {
  const exporter = await requireExporter();
  const s = t(exporter.language);
  const [portfolio, activity] = await Promise.all([loadPortfolio(exporter.id), recentEvents(exporter.id)]);

  // To collect: what's still owed on live deals.
  const toCollect = new Map<string, number>();
  let toCollectKes = 0;
  // On hold: what buyers have asked off in open claims.
  const onHold = new Map<string, number>();
  let onHoldKes = 0;
  for (const d of portfolio) {
    const due = outstanding(d);
    if (due > 0) {
      toCollect.set(d.currency, (toCollect.get(d.currency) ?? 0) + due);
      toCollectKes += toKesMinor(due, kesRate(d.currency));
    }
    for (const c of d.claims.filter((c) => c.status === "open")) {
      onHold.set(d.currency, (onHold.get(d.currency) ?? 0) + c.amountRequestedMinor);
      onHoldKes += toKesMinor(c.amountRequestedMinor, kesRate(d.currency));
    }
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const allPayments = portfolio.flatMap((d) => d.payments);
  const settledKes = allPayments
    .filter((p) => p.status === "settled" && p.settledAt && p.settledAt >= monthStart)
    .reduce((n, p) => n + (p.kesAmountMinor ?? 0), 0);
  const receivedKes = allPayments
    .filter((p) => p.paidAt && p.paidAt >= monthStart)
    .reduce((n, p) => n + (p.kesAmountMinor ?? 0), 0);

  const needsAction = portfolio
    .filter((d) => (NEEDS_EXPORTER as readonly string[]).includes(d.status))
    .sort((a, b) => Number(b.status === "claim_open") - Number(a.status === "claim_open"));

  const perCurrency = (m: Map<string, number>) => [...m].map(([c, v]) => fmt(v, c)).join(" · ");

  return (
    <main className="flex flex-1 flex-col gap-6 md:gap-8">
      <h1 className="text-2xl font-semibold md:text-3xl">{s.dash.title}</h1>

      <section className="grid gap-3 sm:grid-cols-3 md:gap-4">
        <MoneyCard
          label={s.dash.toCollect}
          value={toCollect.size ? perCurrency(toCollect) : s.dash.nothing}
          sub={toCollect.size ? fmtKesShort(toCollectKes) : undefined}
          tone="primary"
        />
        <MoneyCard
          label={s.dash.onHold}
          value={onHold.size ? perCurrency(onHold) : s.dash.nothing}
          sub={onHold.size ? fmtKesShort(onHoldKes) : undefined}
          tone={onHold.size ? "warn" : "plain"}
          href={onHold.size ? "/claims" : undefined}
        />
        <MoneyCard
          label={s.dash.settledMonth}
          value={fmtKesShort(settledKes)}
          sub={`${s.dash.receivedMonth}: ${fmtKesShort(receivedKes)}`}
          tone="plain"
          href="/payments"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
        <section>
          <h2 className={sectionTitle}>{s.dash.needsAction}</h2>
          {needsAction.length === 0 ? (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">{s.dash.allClear}</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {needsAction.map((d) => (
                <li key={d.id}>
                  <Link href={`/deals/${d.id}`} className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusChip status={d.status} label={s.status[d.status]} />
                        <span className="text-sm text-muted-foreground">{d.number}</span>
                      </div>
                      <p className="mt-1 truncate font-medium">{d.buyerCompany}</p>
                      <p className={cn("text-sm", d.status === "claim_open" ? "font-medium text-red-700 dark:text-red-300" : "text-muted-foreground")}>
                        {s.next[d.status]}
                      </p>
                    </div>
                    <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="flex items-baseline justify-between">
            <h2 className={sectionTitle}>{s.dash.recent}</h2>
            <Link href="/deals" className="text-sm text-primary underline-offset-4 hover:underline">
              {s.dash.viewAll}
            </Link>
          </div>
          {activity.length === 0 ? (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">{s.dash.noActivity}</p>
          ) : (
            <ol className="divide-y rounded-xl border">
              {activity.map((e) => (
                <li key={e.id}>
                  <Link href={`/deals/${e.dealId}`} className="block p-4 transition-colors hover:bg-muted/50">
                    <p className="text-sm">{e.summary}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {e.dealNumber} · {e.buyerCompany} · {s.deal.actor[e.actor]} · {fmtTimeEAT(e.createdAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}

function MoneyCard({
  label,
  value,
  sub,
  tone,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "primary" | "warn" | "plain";
  href?: string;
}) {
  const body = (
    <>
      <p className={cn("text-sm", tone === "primary" ? "opacity-85" : "text-muted-foreground")}>{label}</p>
      <p className="mt-1 text-xl leading-tight font-semibold md:text-2xl">{value}</p>
      {sub && <p className={cn("mt-1 text-sm", tone === "primary" ? "opacity-85" : "text-muted-foreground")}>{sub}</p>}
    </>
  );
  const cls = cn(
    "block rounded-xl p-4 md:p-5",
    tone === "primary" && "bg-primary text-primary-foreground",
    tone === "warn" &&
      "border border-amber-300 bg-amber-50 text-amber-950 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
    tone === "plain" && "border",
    tone === "plain" && href && "transition-colors hover:bg-muted/50",
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
