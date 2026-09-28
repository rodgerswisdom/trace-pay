import { CheckCircle2Icon, CircleHelpIcon, CircleMinusIcon, XCircleIcon } from "lucide-react";
import type { Deal, Reading, TransitLog } from "@/db/schema";
import type { Outcome, TermCheck } from "@/lib/claim-check";
import type { strings } from "@/lib/i18n";
import { fmt } from "@/lib/money";
import { minWeightKg } from "@/lib/terms";
import { downsample, summarize } from "@/lib/transit";
import { cn } from "@/lib/utils";
import { TransitChart } from "./transit-chart";

// Quality terms, readings, transit log and the adjustment check — shown to both parties from the same data.
// Colour always has a word beside it: green "Meets term", red "Below term".

type S = (typeof strings)["en"]["deal"];

type TermsDeal = Pick<
  Deal,
  "minDryMatterPct" | "tempMinC" | "tempMaxC" | "breachAdjustPct" | "totalMinor" | "currency" | "weightTolerancePct" | "weightKg" | "adjustWindowHours"
>;

export function QualityTerms({ deal, s }: { deal: TermsDeal; s: S }) {
  if (deal.minDryMatterPct == null && deal.tempMinC == null && deal.weightTolerancePct == null) {
    return <p className="rounded-xl border p-4 text-sm text-muted-foreground">{s.noTerms}</p>;
  }
  const adj = deal.breachAdjustPct ?? 0;
  const days = Math.round(deal.adjustWindowHours / 24);
  return (
    <dl className="grid gap-px overflow-hidden rounded-xl border bg-border text-sm sm:grid-cols-2 lg:grid-cols-3">
      {deal.minDryMatterPct != null && <Cell term={s.minDryMatter} value={`${s.atLeast} ${deal.minDryMatterPct}%`} />}
      {deal.tempMinC != null && deal.tempMaxC != null && <Cell term={s.tempRange} value={`${deal.tempMinC}–${deal.tempMaxC} °C`} />}
      {deal.weightTolerancePct != null && (
        <Cell
          term={s.weightTerm}
          value={`${s.atLeast} ${minWeightKg(deal)!.toLocaleString("en-US")} kg (${deal.weightKg.toLocaleString("en-US")} kg − ${deal.weightTolerancePct}%)`}
        />
      )}
      <Cell term={s.breachAdjust} value={adj ? `${adj}% ${s.ofDealValue} (${fmt(Math.round((deal.totalMinor * adj) / 100), deal.currency)})` : "—"} />
      <Cell term={s.windowTerm} value={s.windowValue.replace("{days}", String(days))} />
    </dl>
  );
}

function Cell({ term, value }: { term: string; value: string }) {
  return (
    <div className="bg-background p-3.5">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

type ReadingLike = Pick<Reading, "stage" | "dryMatterPct" | "sampleSize" | "device" | "pulpTempC" | "netWeightKg" | "measuredBy">;

export function ReadingsCompared({ readings, minDryMatterPct, s }: { readings: ReadingLike[]; minDryMatterPct: number | null; s: S }) {
  const row = (stage: "origin" | "arrival", label: string) => {
    const r = readings.find((x) => x.stage === stage);
    const source = !r ? null : stage === "origin" ? s.sources.exporter : r.measuredBy === "inspector" ? s.sources.independent : s.sources.buyer;
    const parts = r
      ? [
          r.dryMatterPct != null ? `${r.dryMatterPct.toFixed(1)}% dry matter` : null,
          r.pulpTempC != null ? `${s.pulp} ${r.pulpTempC.toFixed(1)} °C` : null,
          r.netWeightKg != null ? `${r.netWeightKg.toLocaleString("en-US")} kg` : null,
        ].filter(Boolean)
      : [];
    const meets = r?.dryMatterPct != null && minDryMatterPct != null ? r.dryMatterPct >= minDryMatterPct : null;
    return (
      <div className="bg-background p-3.5">
        <dt className="flex flex-wrap items-center gap-2 text-muted-foreground">
          {label}
          {source && <SourceTag label={source} />}
        </dt>
        {r ? (
          <dd className="mt-0.5">
            <span className="font-medium">{parts.join(" · ") || "—"}</span>
            {meets !== null && <MeetsWord meets={meets} s={s} className="ml-2" />}
            <span className="block text-xs text-muted-foreground">
              {s.sample} {r.sampleSize} · {r.device}
            </span>
          </dd>
        ) : (
          <dd className="mt-0.5 text-muted-foreground">{s.notYet}</dd>
        )}
      </div>
    );
  };
  return (
    <dl className="grid gap-px overflow-hidden rounded-xl border bg-border text-sm sm:grid-cols-2">
      {row("origin", s.atOrigin)}
      {row("arrival", s.onArrival)}
    </dl>
  );
}

export function SourceTag({ label }: { label: string }) {
  return <span className="inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-foreground">{label}</span>;
}

export function MeetsWord({ meets, s, className }: { meets: boolean | null; s: Pick<S, "meetsTerm" | "belowTerm" | "noRecord">; className?: string }) {
  const Icon = meets === true ? CheckCircle2Icon : meets === false ? XCircleIcon : CircleMinusIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm font-medium whitespace-nowrap",
        meets === true ? "text-emerald-700 dark:text-emerald-400" : meets === false ? "text-red-700 dark:text-red-400" : "text-muted-foreground",
        className,
      )}
    >
      <Icon aria-hidden className="size-4" />
      {meets === true ? s.meetsTerm : meets === false ? s.belowTerm : s.noRecord}
    </span>
  );
}

export function TransitSummary({
  log,
  deal,
  s,
  timeZone,
  downloadHref,
  showFingerprint = false,
}: {
  log: Pick<TransitLog, "points" | "device" | "isSample" | "fileName" | "sha256">;
  deal: Pick<Deal, "tempMinC" | "tempMaxC">;
  s: S;
  timeZone?: string;
  downloadHref: string;
  /** Exporter-side detail; the buyer's screens don't show it. */
  showFingerprint?: boolean;
}) {
  const sum = summarize(log.points, { min: deal.tempMinC, max: deal.tempMaxC });
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <SourceTag label={s.sources.tracker} />
        {log.isSample && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">{s.sampleFeed}</span>}
        <span className="font-medium">
          {sum.count} {s.readingsCount} · {sum.minC.toFixed(1)}–{sum.maxC.toFixed(1)} °C
        </span>
        <span className="text-muted-foreground">
          {sum.minutesOutside == null ? "" : sum.minutesOutside === 0 ? `· ${s.inside}` : `· ${sum.minutesOutside} min ${s.outside}`}
        </span>
      </div>
      <TransitChart points={downsample(log.points)} min={deal.tempMinC} max={deal.tempMaxC} timeZone={timeZone} label={s.transit} />
      <p className="text-xs text-muted-foreground">
        {log.device && `${log.device} · `}
        <a href={downloadHref} className="text-primary underline-offset-4 hover:underline">
          {log.fileName}
        </a>
        {showFingerprint && (
          <>
            {" "}
            · <span className="font-mono break-all">SHA-256 {log.sha256.slice(0, 16)}…</span>
          </>
        )}
      </p>
    </div>
  );
}

const OUTCOME_ICON: Record<Outcome, { Icon: typeof CheckCircle2Icon; cls: string }> = {
  below: { Icon: XCircleIcon, cls: "text-red-700 dark:text-red-400" },
  meets: { Icon: CheckCircle2Icon, cls: "text-emerald-700 dark:text-emerald-400" },
  review: { Icon: CircleHelpIcon, cls: "text-muted-foreground" },
  insufficient: { Icon: CircleHelpIcon, cls: "text-muted-foreground" },
};

/**
 * The adjustment check as a comparison table: one row per evidence source against the agreed standard.
 * `sentence` replaces the outcome heading (the buyer's result screen writes its own).
 */
export function AdjustmentCheck({ check, s, currency, sentence }: { check: TermCheck; s: S; currency: string; sentence?: React.ReactNode }) {
  const { Icon, cls } = OUTCOME_ICON[check.outcome];
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4 md:p-5">
      {sentence ?? (
        <p className="flex items-center gap-2 text-lg font-semibold">
          <Icon aria-hidden className={cn("size-5 shrink-0", cls)} />
          {s.outcomes[check.outcome]}
        </p>
      )}
      {check.standard && (
        <p className="text-sm">
          <span className="text-muted-foreground">{s.agreed}:</span> {check.standard}
        </p>
      )}
      {check.rows.length > 0 && (
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sr-only sm:not-sr-only">
            <tr className="border-b text-xs text-muted-foreground uppercase">
              <th className="py-1.5 pr-3 font-semibold">{s.evidenceSource}</th>
              <th className="py-1.5 pr-3 font-semibold">{s.measured}</th>
              <th className="py-1.5 font-semibold">{s.result}</th>
            </tr>
          </thead>
          <tbody>
            {check.rows.map((r) => (
              <tr key={r.stage} className="border-b align-top last:border-0">
                <td className="py-2 pr-3">
                  <span className="block font-medium">{s.stages[r.stage]}</span>
                  <SourceTag label={s.sources[r.source]} />
                </td>
                <td className="py-2 pr-3 tabular-nums">{r.value}</td>
                <td className="py-2">
                  <MeetsWord meets={r.meets} s={s} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {check.outcome === "below" && check.adjustmentMinor > 0 && !sentence && (
        <p className="text-sm font-medium">
          {s.agreedAdjustment}: {fmt(check.adjustmentMinor, currency)}
        </p>
      )}
    </div>
  );
}
