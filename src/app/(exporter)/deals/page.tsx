import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { requireExporter } from "@/auth";
import { BottomBar, primaryButton } from "@/components/bottom-bar";
import { StatusChip } from "@/components/status-chip";
import { buttonVariants } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { both, kesRate } from "@/lib/money";
import { STAGES, loadPortfolio, type StageKey } from "@/lib/portfolio";
import { cn } from "@/lib/utils";

export default async function DealsPage({ searchParams }: PageProps<"/deals">) {
  const exporter = await requireExporter();
  const s = t(exporter.language);
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  const stage = STAGES.find((st) => st.key === sp.stage)?.key ?? null;

  const all = await loadPortfolio(exporter.id);

  // Search first, so chip counts reflect the search.
  const needle = q.toLowerCase();
  const searched = needle
    ? all.filter((d) =>
        [d.buyerCompany, d.buyerContact, d.buyerEmail, d.number, d.destination, d.product].some((f) => f.toLowerCase().includes(needle)),
      )
    : all;

  const inStage = (key: StageKey) => (d: (typeof all)[number]) =>
    (STAGES.find((st) => st.key === key)!.statuses as readonly string[]).includes(d.status);

  const shown = (stage ? searched.filter(inStage(stage)) : searched).sort(
    (a, b) => Number(b.status === "claim_open") - Number(a.status === "claim_open"),
  );

  const href = (next: { stage?: string | null; q?: string }) => {
    const params = new URLSearchParams();
    const st = next.stage === undefined ? stage : next.stage;
    const qq = next.q === undefined ? q : next.q;
    if (st) params.set("stage", st);
    if (qq) params.set("q", qq);
    const str = params.toString();
    return str ? `/deals?${str}` : "/deals";
  };

  const chipLabel = (key: StageKey) => (key === "paid" ? s.dealsList.paid : s.status[key]);

  return (
    <main className="flex flex-1 flex-col gap-4 md:gap-6">
      <h1 className="text-2xl font-semibold md:text-3xl">{s.dealsList.title}</h1>

      <form action="/deals" className="flex gap-2 md:max-w-xl" role="search">
        {stage && <input type="hidden" name="stage" value={stage} />}
        <div className="relative flex-1">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder={s.dealsList.search}
            aria-label={s.dealsList.search}
            className="h-12 w-full rounded-lg border border-input bg-transparent pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-11"
          />
        </div>
        <button className={cn(buttonVariants({ variant: "outline" }), "h-12 px-4 text-base md:h-11")}>{s.dealsList.searchButton}</button>
      </form>

      {/* Stage chips: scroll sideways on phones, wrap on larger screens */}
      <nav aria-label="Filter by stage" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
        <ul className="flex w-max gap-2 md:w-auto md:flex-wrap">
          <Chip href={href({ stage: null })} active={!stage} label={s.dealsList.all} count={searched.length} />
          {STAGES.map((st) => {
            const n = searched.filter(inStage(st.key)).length;
            if (n === 0 && stage !== st.key) return null;
            return (
              <Chip
                key={st.key}
                href={href({ stage: st.key })}
                active={stage === st.key}
                label={chipLabel(st.key)}
                count={n}
                urgent={st.key === "claim_open" && n > 0}
              />
            );
          })}
        </ul>
      </nav>

      {shown.length === 0 ? (
        <div className="rounded-xl border p-6 text-center text-muted-foreground">
          {all.length === 0 ? s.home.empty : s.dealsList.noMatch}
          {(q || stage) && all.length > 0 && (
            <Link href="/deals" className="ml-2 text-primary underline-offset-4 hover:underline">
              {s.dealsList.clear}
            </Link>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
          {shown.map((d) => {
            const claim = d.status === "claim_open";
            return (
              <li key={d.id}>
                <Link
                  href={`/deals/${d.id}`}
                  className={cn(
                    "block h-full rounded-xl border p-4 transition-colors hover:bg-muted/50 active:bg-muted md:p-5",
                    claim && "border-2 border-red-500 bg-red-50/50 dark:bg-red-950/20",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{d.buyerCompany}</p>
                      <p className="text-sm text-muted-foreground">
                        {d.product} · {d.weightKg.toLocaleString("en-US")} kg · {d.number}
                      </p>
                    </div>
                    <StatusChip status={d.status} label={s.status[d.status]} className="shrink-0" />
                  </div>
                  <p className="mt-2 text-sm font-medium">{both(d.totalMinor, d.currency, kesRate(d.currency))}</p>
                  <p className={cn("mt-1 text-sm", claim ? "font-medium text-red-700 dark:text-red-300" : "text-muted-foreground")}>
                    {s.next[d.status]}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <BottomBar desktop="hidden">
        <Link href="/deals/new" className={cn(buttonVariants(), primaryButton)}>
          {s.home.newDeal}
        </Link>
      </BottomBar>
    </main>
  );
}

function Chip({ href, active, label, count, urgent }: { href: string; active: boolean; label: string; count: number; urgent?: boolean }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "true" : undefined}
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors md:h-9",
          active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
        )}
      >
        {label}
        <span
          className={cn(
            "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs",
            active ? "bg-primary-foreground/20" : urgent ? "bg-red-600 text-white" : "bg-muted",
          )}
        >
          {count}
        </span>
      </Link>
    </li>
  );
}
