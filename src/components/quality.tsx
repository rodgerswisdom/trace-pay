import { CheckCircle2Icon, CircleHelpIcon, TriangleAlertIcon, XCircleIcon } from "lucide-react";
import type { Deal, Reading, TransitLog } from "@/db/schema";
import type { ClaimCheck } from "@/lib/claim-check";
import type { strings } from "@/lib/i18n";
import { fmt } from "@/lib/money";
import { downsample, summarize } from "@/lib/transit";
import { cn } from "@/lib/utils";
import { TransitChart } from "./transit-chart";

// Quality terms, readings, transit log and the claim check — shown to both parties from the same data.

type S = (typeof strings)["en"]["deal"];

export function QualityTerms({ deal, s }: { deal: Pick<Deal, "minDryMatterPct" | "tempMinC" | "tempMaxC" | "breachAdjustPct" | "totalMinor" | "currency">; s: S }) {
  if (deal.minDryMatterPct == null && deal.tempMinC == null) return <p className="rounded-xl border p-4 text-sm text-muted-foreground">{s.noTerms}</p>;
  const adj = deal.breachAdjustPct ?? 0;
  return (
    <dl className="grid gap-px overflow-hidden rounded-xl border bg-border text-sm sm:grid-cols-3">
      <Cell term={s.minDryMatter} value={deal.minDryMatterPct != null ? `≥ ${deal.minDryMatterPct}%` : "—"} />
      <Cell term={s.tempRange} value={deal.tempMinC != null && deal.tempMaxC != null ? `${deal.tempMinC}–${deal.tempMaxC} °C` : "—"} />
      <Cell
        term={s.breachAdjust}
        value={adj ? `${adj}% ${s.ofDealValue} (${fmt(Math.round((deal.totalMinor * adj) / 100), deal.currency)})` : "—"}
      />
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

export function ReadingsCompared({
  readings,
  minDryMatterPct,
  s,
}: {
  readings: Pick<Reading, "stage" | "dryMatterPct" | "sampleSize" | "device" | "pulpTempC">[];
  minDryMatterPct: number | null;
  s: S;
}) {
  const row = (stage: "origin" | "arrival", label: string) => {
    const r = readings.find((x) => x.stage === stage);
    const ok = r && minDryMatterPct != null ? r.dryMatterPct >= minDryMatterPct : null;
    return (
      <div className="bg-background p-3.5">
        <dt className="text-muted-foreground">{label}</dt>
        {r ? (
          <dd className="mt-0.5">
            <span className="inline-flex items-center gap-1.5 font-medium">
              {ok === true && <CheckCircle2Icon aria-hidden className="size-4 text-emerald-600" />}
              {ok === false && <XCircleIcon aria-hidden className="size-4 text-red-600" />}
              {r.dryMatterPct.toFixed(1)}% dry matter
              {ok !== null && <span className="sr-only">{ok ? s.ok : s.breached}</span>}
            </span>
            <span className="block text-xs text-muted-foreground">
              {s.sample} {r.sampleSize} · {r.device}
              {r.pulpTempC != null && ` · ${s.pulp} ${r.pulpTempC.toFixed(1)} °C`}
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

export function TransitSummary({
  log,
  deal,
  s,
  timeZone,
  downloadHref,
}: {
  log: Pick<TransitLog, "points" | "device" | "isSample" | "fileName" | "sha256">;
  deal: Pick<Deal, "tempMinC" | "tempMaxC">;
  s: S;
  timeZone?: string;
  downloadHref: string;
}) {
  const sum = summarize(log.points, { min: deal.tempMinC, max: deal.tempMaxC });
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
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
        </a>{" "}
        · <span className="font-mono break-all">SHA-256 {log.sha256.slice(0, 16)}…</span>
      </p>
    </div>
  );
}

// Neutral card for both parties; the icon and the words carry the verdict.
const VERDICT_TONE = {
  supported: { cls: "text-amber-600", Icon: TriangleAlertIcon },
  not_supported: { cls: "text-emerald-600", Icon: CheckCircle2Icon },
  no_agreed_test: { cls: "text-muted-foreground", Icon: CircleHelpIcon },
  insufficient: { cls: "text-muted-foreground", Icon: CircleHelpIcon },
} as const;

/** The claim check: the same wording and data for the exporter, the buyer and the evidence bundle. */
export function ClaimCheckCard({ check, s, currency }: { check: ClaimCheck; s: S; currency: string }) {
  const { cls, Icon } = VERDICT_TONE[check.verdict];
  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 bg-muted/30 p-4 md:p-5">
      <p className="flex items-center gap-2 text-lg font-semibold">
        <Icon aria-hidden className={cn("size-5 shrink-0", cls)} />
        {s.verdict[check.verdict]}
      </p>
      <p className="text-sm">{check.reason}</p>
      {check.lines.length > 0 && (
        <ul className="flex flex-col gap-2 sm:hidden">
          {check.lines.map((l) => (
            <li key={l.test} className={cn("rounded-lg border bg-background p-3 text-sm", !check.decidingTests.includes(l.test) && "opacity-70")}>
              <p className="flex justify-between gap-2 font-medium">
                <span>{s.tests[l.test]}</span>
                <span>{l.ok === null ? s.unknown : l.ok ? s.ok : s.breached}</span>
              </p>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                <dt className="text-muted-foreground">{s.agreed}</dt>
                <dd>{l.agreed}</dd>
                <dt className="text-muted-foreground">{s.atOrigin}</dt>
                <dd>{l.origin ?? "—"}</dd>
                <dt className="text-muted-foreground">{s.arrivalOrTransit}</dt>
                <dd>
                  {l.test === "transit_temp" ? (l.transit ?? "—") : (l.arrival ?? "—")}
                  {l.test === "transit_temp" && l.arrival && ` · ${s.pulp} ${l.arrival}`}
                </dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
      {check.lines.length > 0 && (
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground uppercase">
                <th className="py-1.5 pr-3 font-semibold">{s.test}</th>
                <th className="py-1.5 pr-3 font-semibold">{s.agreed}</th>
                <th className="py-1.5 pr-3 font-semibold">{s.atOrigin}</th>
                <th className="py-1.5 pr-3 font-semibold">{s.arrivalOrTransit}</th>
                <th className="py-1.5 font-semibold">{s.result}</th>
              </tr>
            </thead>
            <tbody>
              {check.lines.map((l) => (
                <tr key={l.test} className={cn("border-b align-top", !check.decidingTests.includes(l.test) && "opacity-70")}>
                  <td className="py-1.5 pr-3 font-medium">{s.tests[l.test]}</td>
                  <td className="py-1.5 pr-3">{l.agreed}</td>
                  <td className="py-1.5 pr-3">{l.origin ?? "—"}</td>
                  <td className="py-1.5 pr-3">
                    {l.test === "transit_temp" ? (l.transit ?? "—") : (l.arrival ?? "—")}
                    {l.test === "transit_temp" && l.arrival && <span className="block text-xs opacity-80">{s.pulp} {l.arrival}</span>}
                  </td>
                  <td className="py-1.5 font-medium">{l.ok === null ? s.unknown : l.ok ? s.ok : s.breached}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {check.notes.map((n) => (
        <p key={n} className="text-xs opacity-80">
          {n}
        </p>
      ))}
      {check.verdict === "supported" && check.agreedAdjustmentMinor > 0 && (
        <p className="text-sm font-medium">
          {s.agreedAdjustment}: {fmt(check.agreedAdjustmentMinor, currency)}
        </p>
      )}
    </div>
  );
}
