import Link from "next/link";
import { ChevronRightIcon, ShieldCheckIcon } from "lucide-react";
import { requireExporter } from "@/auth";
import { StatusChip } from "@/components/status-chip";
import { fmtTimeEAT } from "@/lib/deals";
import { t } from "@/lib/i18n";
import { sectionTitle } from "@/lib/layout";
import { fmt, fmtKesShort, kesRate, toKesMinor } from "@/lib/money";
import { NEEDS_EXPORTER, loadPortfolio, outstanding, recentEvents } from "@/lib/portfolio";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { WithdrawalStatusTag } from "@/components/getting-paid";
import type { WithdrawalStatus } from "@/db/schema";
import { loadBalances, loadWithdrawals, payoutMode, type Balance } from "@/lib/payouts-server";

export default async function HomePage() {
  const exporter = await requireExporter();
  const s = t(exporter.language);
  const [portfolio, activity, balances, recentWithdrawals] = await Promise.all([
    loadPortfolio(exporter.id),
    recentEvents(exporter.id),
    loadBalances(exporter.id),
    loadWithdrawals(exporter.id, 5),
  ]);
  const inFlight = recentWithdrawals.find((w) => w.status === "initiated" || w.status === "on_its_way");

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

  const needsAction = portfolio
    .filter((d) => (NEEDS_EXPORTER as readonly string[]).includes(d.status))
    .sort((a, b) => Number(b.status === "claim_open") - Number(a.status === "claim_open"));

  const perCurrency = (m: Map<string, number>) => [...m].map(([c, v]) => fmt(v, c)).join(" · ");

  return (
    <main className="flex flex-1 flex-col gap-6 md:gap-8">
      <h1 className="text-2xl font-semibold md:text-3xl">{s.dash.title}</h1>

      <section className="grid gap-3 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:gap-4">
        <BalanceCard
          balances={balances}
          frozen={!!exporter.withdrawalsFrozenAt}
          mode={payoutMode()}
          inFlight={inFlight ? { id: inFlight.id, status: inFlight.status, label: fmt(inFlight.receiveMinor, "KES") } : null}
          incoming={toCollect.size ? perCurrency(toCollect) : null}
        />
        <div className="grid gap-3 md:gap-4">
          <MoneyCard
            label="Expected from buyers"
            value={toCollect.size ? perCurrency(toCollect) : s.dash.nothing}
            sub={toCollect.size ? `${fmtKesShort(toCollectKes)} · not in your balance yet` : undefined}
            tone="plain"
            href="/deals"
          />
          <MoneyCard
            label={s.dash.onHold}
            value={onHold.size ? perCurrency(onHold) : s.dash.nothing}
            sub={onHold.size ? fmtKesShort(onHoldKes) : undefined}
            tone={onHold.size ? "warn" : "plain"}
            href={onHold.size ? "/claims" : undefined}
          />
        </div>
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

/** What the exporter can withdraw now, per currency. Money still owed by buyers is shown apart from it. */
function BalanceCard({
  balances,
  frozen,
  mode,
  inFlight,
  incoming,
}: {
  balances: Balance[];
  frozen: boolean;
  mode: "live" | "practice" | "paused";
  inFlight: { id: string; status: WithdrawalStatus; label: string } | null;
  incoming: string | null;
}) {
  const withBalance = balances.filter((b) => b.availableMinor > 0);
  const kes = withBalance.reduce((n, b) => n + toKesMinor(b.availableMinor, b.rate), 0);
  const canWithdraw = withBalance.length > 0 && !frozen && mode !== "paused";
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-primary p-4 text-primary-foreground md:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm opacity-85">Your balance</p>
        <p className="inline-flex items-center gap-1 text-xs opacity-85">
          <ShieldCheckIcon aria-hidden className="size-3.5" />
          Held by Payaza
        </p>
      </div>
      {withBalance.length === 0 ? (
        <div>
          <p className="text-3xl leading-tight font-semibold">KES 0</p>
          <p className="mt-1 text-sm opacity-85">
            {incoming ? `Nothing to withdraw yet. ${incoming} is expected from buyers.` : "Nothing to withdraw yet. Payments from buyers land here."}
          </p>
        </div>
      ) : (
        <div>
          <ul className="flex flex-col gap-0.5">
            {withBalance.map((b) => (
              <li key={b.currency} className="text-3xl leading-tight font-semibold tabular-nums">
                {fmt(b.availableMinor, b.currency)}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-sm opacity-85">About {fmtKesShort(kes)} at today&apos;s rate</p>
        </div>
      )}
      {inFlight && (
        <Link href={`/withdrawals/${inFlight.id}`} className="flex items-center gap-2 rounded-lg bg-background/95 p-3 text-sm text-foreground">
          <WithdrawalStatusTag status={inFlight.status} />
          <span className="min-w-0 flex-1 truncate">{inFlight.label} to your account</span>
          <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      )}
      {frozen && <p className="rounded-lg bg-background/95 p-3 text-sm text-foreground">Withdrawals are frozen. Unfreeze them in Account to withdraw.</p>}
      {!frozen && mode === "paused" && (
        <p className="rounded-lg bg-background/95 p-3 text-sm text-foreground">Withdrawals are paused right now. Your balance is safe.</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {canWithdraw ? (
          <Link href="/withdraw" className={cn(buttonVariants({ variant: "secondary" }), "h-12 text-base")}>
            Withdraw
          </Link>
        ) : (
          <span aria-disabled className={cn(buttonVariants({ variant: "secondary" }), "pointer-events-none h-12 text-base opacity-60")}>
            Withdraw
          </span>
        )}
        <Link
          href="/withdrawals"
          className={cn(buttonVariants({ variant: "outline" }), "h-12 border-primary-foreground/40 bg-transparent text-base text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground")}
        >
          History
        </Link>
      </div>
    </div>
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
