import Link from "next/link";
import { CheckCircle2Icon, CircleHelpIcon, XCircleIcon } from "lucide-react";
import { claimCheckFor } from "@/lib/claim-check";
import { requireExporter } from "@/auth";
import { buttonVariants } from "@/components/ui/button";
import type { Claim } from "@/db/schema";
import { fmtTimeEAT } from "@/lib/deals";
import { t } from "@/lib/i18n";
import { sectionTitle } from "@/lib/layout";
import { both, fmt, kesRate } from "@/lib/money";
import { loadPortfolio, type DealWithMoney } from "@/lib/portfolio";
import { cn } from "@/lib/utils";

type Row = Claim & { deal: DealWithMoney };

export default async function ClaimsPage() {
  const exporter = await requireExporter();
  const strs = t(exporter.language);
  const s = strs.claimsList;
  const d = strs.deal;
  const portfolio = await loadPortfolio(exporter.id);

  const all: Row[] = portfolio.flatMap((d) => d.claims.map((c) => ({ ...c, deal: d })));
  const open = all.filter((c) => c.status === "open").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const resolved = all
    .filter((c) => c.status !== "open")
    .sort((a, b) => (b.respondedAt ?? b.createdAt).getTime() - (a.respondedAt ?? a.createdAt).getTime());

  return (
    <main className="flex flex-1 flex-col gap-6 md:gap-8">
      <h1 className="text-2xl font-semibold md:text-3xl">{s.title}</h1>

      <section>
        <h2 className={sectionTitle}>
          {s.open} · {open.length}
        </h2>
        {open.length === 0 ? (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">{s.noOpen}</p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {open.map((c) => (
              <li key={c.id} className="flex flex-col gap-3 rounded-xl border-2 border-amber-300 bg-amber-50/40 p-4 md:p-5 dark:border-amber-800 dark:bg-amber-950/20">
                <ClaimHeader c={c} s={s} d={d} />
                <p className="text-sm">{c.description}</p>
                <p className="font-medium">
                  {both(c.amountRequestedMinor, c.deal.currency, kesRate(c.deal.currency))} {s.asked}
                </p>
                <Link href={`/deals/${c.deal.id}`} className={cn(buttonVariants(), "h-12 text-base md:h-10 md:w-fit md:px-6 md:text-sm")}>
                  {s.respond}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className={sectionTitle}>
          {s.resolved} · {resolved.length}
        </h2>
        {resolved.length === 0 ? (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">{s.noResolved}</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {resolved.map((c) => {
              const cur = c.deal.currency;
              const outcome =
                c.status === "accepted"
                  ? `${s.accepted} · ${fmt(c.agreedAmountMinor ?? c.amountRequestedMinor, cur)} ${d.off}`
                  : c.status === "countered"
                    ? `${s.countered} · ${fmt(c.agreedAmountMinor ?? 0, cur)} ${d.off} (${d.asked.toLowerCase()} ${fmt(c.amountRequestedMinor, cur)})`
                    : c.status === "withdrawn"
                      ? s.withdrawn
                      : `${s.rejected} · ${d.asked.toLowerCase()} ${fmt(c.amountRequestedMinor, cur)}`;
              return (
                <li key={c.id}>
                  <Link href={`/deals/${c.deal.id}`} className="flex flex-col gap-2 p-4 transition-colors hover:bg-muted/50 md:p-5">
                    <ClaimHeader c={c} s={s} d={d} />
                    <p
                      className={cn(
                        "text-sm font-medium",
                        c.status === "rejected" ? "text-emerald-700 dark:text-emerald-400" : "text-foreground",
                      )}
                    >
                      {outcome}
                    </p>
                    {c.responseNote && <p className="text-sm text-muted-foreground">{c.responseNote}</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function ClaimHeader({ c, s, d }: { c: Row; s: ReturnType<typeof t>["claimsList"]; d: ReturnType<typeof t>["deal"] }) {
  const check = claimCheckFor({ deal: c.deal, claim: c, readings: c.deal.readings, transitLog: c.deal.transitLog });
  const Icon = check.outcome === "below" ? XCircleIcon : check.outcome === "meets" ? CheckCircle2Icon : CircleHelpIcon;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <div className="min-w-0">
        <p className="font-medium">
          {s.reason[c.reason]} · {c.deal.number}
        </p>
        <p className="truncate text-sm text-muted-foreground">{c.deal.buyerCompany}</p>
        <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium">
          <Icon
            aria-hidden
            className={cn(
              "size-4",
              check.outcome === "below" ? "text-red-700 dark:text-red-400" : check.outcome === "meets" ? "text-emerald-600" : "text-muted-foreground",
            )}
          />
          {d.outcomes[check.outcome]}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">{fmtTimeEAT(c.createdAt)}</p>
    </div>
  );
}
