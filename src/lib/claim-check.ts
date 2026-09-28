import type { Claim, Deal, Reading, TransitLog } from "@/db/schema";
import { EXCURSION_TOLERANCE_MIN, summarize } from "./transit";

// The claim check: line up origin vs arrival vs the agreed terms, and say whether the agreed test
// supports the claim. Pure and deterministic, so the exporter, the buyer and the evidence bundle
// all see the same result from the same locked data.

export type Verdict = "supported" | "not_supported" | "no_agreed_test" | "insufficient";

export type CheckLine = {
  test: "dry_matter" | "transit_temp";
  agreed: string;
  origin: string | null;
  arrival: string | null;
  transit: string | null;
  /** true = within terms, false = breached, null = can't tell. */
  ok: boolean | null;
};

export type ClaimCheck = {
  verdict: Verdict;
  /** The test(s) that decide this kind of claim. */
  decidingTests: CheckLine["test"][];
  lines: CheckLine[];
  /** Plain-English reason for the verdict. */
  reason: string;
  /** Terms breached, per the deciding test(s). */
  breaches: CheckLine["test"][];
  /** The agreed adjustment if supported, in minor units (capped below what the claim can reduce). */
  agreedAdjustmentMinor: number;
  notes: string[];
};

type Terms = Pick<Deal, "minDryMatterPct" | "tempMinC" | "tempMaxC" | "breachAdjustPct" | "totalMinor">;

const DECIDING: Record<Claim["reason"], CheckLine["test"][]> = {
  immature: ["dry_matter"],
  overripe_damaged: ["transit_temp"],
  underweight: [],
  other: [],
};

const pct = (v: number) => `${v.toFixed(1)}%`;
const degC = (v: number) => `${v.toFixed(1)} °C`;

export function checkClaim(input: {
  reason: Claim["reason"];
  terms: Terms;
  origin?: Pick<Reading, "dryMatterPct" | "sampleSize" | "device" | "pulpTempC"> | null;
  arrival?: Pick<Reading, "dryMatterPct" | "sampleSize" | "device" | "pulpTempC"> | null;
  transit?: Pick<TransitLog, "points"> | null;
  /** The most the adjustment can be (the tranche the claim reduces, minus one minor unit). */
  capMinor: number;
}): ClaimCheck {
  const { terms, origin, arrival, transit } = input;
  const lines: CheckLine[] = [];
  const notes: string[] = [];

  // Dry matter: a maturity test. Breached if a reading is below the agreed minimum.
  if (terms.minDryMatterPct != null) {
    const min = terms.minDryMatterPct;
    const o = origin?.dryMatterPct ?? null;
    const a = arrival?.dryMatterPct ?? null;
    const known = [o, a].filter((v): v is number => v != null);
    lines.push({
      test: "dry_matter",
      agreed: `≥ ${pct(min)}`,
      origin: o != null ? `${pct(o)} (n=${origin!.sampleSize})` : null,
      arrival: a != null ? `${pct(a)} (n=${arrival!.sampleSize})` : null,
      transit: null,
      ok: known.length === 0 ? null : known.every((v) => v >= min),
    });
    if (o != null && a != null && o >= min !== a >= min) notes.push("The origin and arrival dry-matter readings disagree about the minimum.");
  }

  // Transit temperature: breached if the log sits outside the agreed range for longer than the tolerance.
  if (terms.tempMinC != null && terms.tempMaxC != null) {
    const range = `${terms.tempMinC.toFixed(1)}–${terms.tempMaxC.toFixed(1)} °C`;
    const sum = transit ? summarize(transit.points, { min: terms.tempMinC, max: terms.tempMaxC }) : null;
    lines.push({
      test: "transit_temp",
      agreed: range,
      origin: origin?.pulpTempC != null ? degC(origin.pulpTempC) : null,
      arrival: arrival?.pulpTempC != null ? degC(arrival.pulpTempC) : null,
      transit: sum
        ? `${degC(sum.minC)} to ${degC(sum.maxC)} · ${sum.minutesOutside ? `${sum.minutesOutside} min outside` : "always inside"}`
        : null,
      ok: sum ? (sum.minutesOutside ?? 0) <= EXCURSION_TOLERANCE_MIN : null,
    });
    if (sum && (sum.minutesOutside ?? 0) > 0 && (sum.minutesOutside ?? 0) <= EXCURSION_TOLERANCE_MIN) {
      notes.push(`Brief excursions (${sum.minutesOutside} min) are within the ${EXCURSION_TOLERANCE_MIN}-minute tolerance.`);
    }
  }

  const deciding = DECIDING[input.reason].filter((t) => lines.some((l) => l.test === t));
  const decidingLines = lines.filter((l) => deciding.includes(l.test));
  const breaches = decidingLines.filter((l) => l.ok === false).map((l) => l.test);

  let verdict: Verdict;
  let reason: string;
  if (DECIDING[input.reason].length === 0 || deciding.length === 0) {
    verdict = "no_agreed_test";
    reason = "No agreed test covers this kind of claim. Review the evidence.";
  } else if (breaches.length > 0) {
    verdict = "supported";
    reason = breaches.includes("dry_matter")
      ? `A dry-matter reading is below the agreed minimum of ${pct(terms.minDryMatterPct!)}.`
      : `The transit log was outside the agreed ${decidingLines[0].agreed} for longer than ${EXCURSION_TOLERANCE_MIN} minutes.`;
  } else if (decidingLines.some((l) => l.ok === null)) {
    verdict = "insufficient";
    reason = deciding.includes("transit_temp") ? "No transit log was attached, so the agreed temperature test can't be run." : "No dry-matter reading was recorded.";
  } else {
    verdict = "not_supported";
    reason = deciding.includes("dry_matter")
      ? `Dry matter met the agreed minimum of ${pct(terms.minDryMatterPct!)}${arrival ? " at origin and on arrival" : " at origin (no arrival reading)"}.`
      : `The transit log stayed within the agreed ${decidingLines[0].agreed}.`;
  }

  const adjustment =
    verdict === "supported" && terms.breachAdjustPct
      ? Math.min(Math.round((terms.totalMinor * terms.breachAdjustPct * breaches.length) / 100), Math.max(0, input.capMinor))
      : 0;

  return { verdict, decidingTests: deciding, lines, reason, breaches, agreedAdjustmentMinor: adjustment, notes };
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  supported: "Claim supported",
  not_supported: "Claim not supported by the agreed test",
  no_agreed_test: "No agreed test for this claim",
  insufficient: "Not enough data to check",
};

/** The check for a deal's claim, from loadDeal data. The cap is the tranche the claim reduces. */
export function claimCheckFor(data: {
  deal: Terms & Pick<Deal, "depositPct" | "finalPct">;
  claim: Pick<Claim, "reason" | "appliesTo">;
  readings: Pick<Reading, "stage" | "dryMatterPct" | "sampleSize" | "device" | "pulpTempC">[];
  transitLog: Pick<TransitLog, "points"> | null;
}) {
  const { deal, claim } = data;
  const deposit = Math.round((deal.totalMinor * deal.depositPct) / 100);
  const final = Math.round((deal.totalMinor * deal.finalPct) / 100);
  const tranche = claim.appliesTo === "final" ? final : deal.totalMinor - deposit - final;
  return checkClaim({
    reason: claim.reason,
    terms: deal,
    origin: data.readings.find((r) => r.stage === "origin") ?? null,
    arrival: data.readings.find((r) => r.stage === "arrival") ?? null,
    transit: data.transitLog,
    capMinor: tranche - 1,
  });
}
