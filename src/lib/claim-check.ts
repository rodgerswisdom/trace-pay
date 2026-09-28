import type { Claim, Deal, Reading, TransitLog } from "@/db/schema";
import { splitTranches } from "./money";
import { REASON_TERM, adjustmentFor, meetsTerm, minWeightKg, termStandard, type TermKey } from "./terms";
import { EXCURSION_TOLERANCE_MIN, summarize } from "./transit";

// The adjustment check: line up each evidence source (at dispatch, in transit, at arrival) against the
// agreed standard, and say whether the agreed term was met. Pure and deterministic, so the buyer, the
// exporter and the evidence bundle all see the same result from the same recorded data.
//
// Rules of thumb that make an invented request hard to fake:
//  - an independent inspector's measurement, a failing dispatch record or a failing tracker log counts;
//  - a buyer's own measurement that contradicts the dispatch record goes to the exporter to review;
//  - a weight shortfall needs a weighbridge ticket, so it counts either way.

export type Outcome = "below" | "meets" | "review" | "insufficient";
export type Stage = "dispatch" | "transit" | "arrival";
export type Source = "independent" | "exporter" | "buyer" | "tracker";

export type CheckRow = { stage: Stage; value: string; source: Source; meets: boolean | null };

export type TermCheck = {
  term: TermKey | null;
  standard: string | null;
  rows: CheckRow[];
  outcome: Outcome;
  /** The agreed adjustment when the outcome is "below", in minor units. */
  adjustmentMinor: number;
};

type CheckDeal = Pick<
  Deal,
  "minDryMatterPct" | "tempMinC" | "tempMaxC" | "weightTolerancePct" | "weightKg" | "breachAdjustPct" | "totalMinor"
>;
type R = Pick<Reading, "dryMatterPct" | "pulpTempC" | "netWeightKg" | "sampleSize" | "measuredBy"> | null | undefined;

const pct = (v: number) => `${v.toFixed(1)}%`;
const degC = (v: number) => `${v.toFixed(1)} °C`;
const kg = (v: number) => `${v.toLocaleString("en-US", { maximumFractionDigits: 1 })} kg`;
const arrivalSource = (r: R): Source => (r?.measuredBy === "inspector" ? "independent" : "buyer");

export function checkTerm(input: {
  term: TermKey | null;
  deal: CheckDeal;
  origin?: R;
  arrival?: R;
  transit?: Pick<TransitLog, "points"> | null;
  /** The payment the adjustment would come off. */
  trancheMinor: number;
}): TermCheck {
  const { term, deal, origin, arrival, transit } = input;
  if (!term) return { term: null, standard: null, rows: [], outcome: "insufficient", adjustmentMinor: 0 };
  const rows: CheckRow[] = [];
  let outcome: Outcome = "insufficient";
  const byInspector = arrival?.measuredBy === "inspector";

  if (term === "dry_matter") {
    const o = origin?.dryMatterPct ?? null;
    const a = arrival?.dryMatterPct ?? null;
    if (o != null) rows.push({ stage: "dispatch", value: `${pct(o)} · ${origin!.sampleSize} fruit`, source: "exporter", meets: meetsTerm(term, deal, o) });
    if (a != null) rows.push({ stage: "arrival", value: `${pct(a)} · ${arrival!.sampleSize} fruit`, source: arrivalSource(arrival), meets: meetsTerm(term, deal, a) });
    const oMeets = meetsTerm(term, deal, o);
    const aMeets = meetsTerm(term, deal, a);
    if (oMeets === false || (aMeets === false && byInspector)) outcome = "below";
    else if (aMeets === false) outcome = "review"; // buyer's own reading vs the dispatch record (or no dispatch record)
    else if (oMeets === true || aMeets === true) outcome = "meets";
  }

  if (term === "temperature") {
    const range = { min: deal.tempMinC, max: deal.tempMaxC };
    if (origin?.pulpTempC != null) rows.push({ stage: "dispatch", value: degC(origin.pulpTempC), source: "exporter", meets: meetsTerm(term, deal, origin.pulpTempC) });
    let tMeets: boolean | null = null;
    if (transit) {
      const sum = summarize(transit.points, range);
      tMeets = (sum.minutesOutside ?? 0) <= EXCURSION_TOLERANCE_MIN;
      rows.push({
        stage: "transit",
        value: `${degC(sum.minC)} to ${degC(sum.maxC)}${sum.minutesOutside ? ` · ${sum.minutesOutside} min outside` : ""}`,
        source: "tracker",
        meets: tMeets,
      });
    }
    const a = arrival?.pulpTempC ?? null;
    if (a != null) rows.push({ stage: "arrival", value: `${degC(a)} · ${arrival!.sampleSize} fruit`, source: arrivalSource(arrival), meets: meetsTerm(term, deal, a) });
    const aMeets = meetsTerm(term, deal, a);
    if (tMeets === false) outcome = "below";
    else if (tMeets === true) outcome = aMeets === false && byInspector ? "review" : "meets";
    else if (aMeets === false) outcome = byInspector ? "below" : "review";
    else if (aMeets === true) outcome = "meets";
  }

  if (term === "weight") {
    rows.push({ stage: "dispatch", value: `${kg(deal.weightKg)} invoiced`, source: "exporter", meets: meetsTerm(term, deal, deal.weightKg) });
    const a = arrival?.netWeightKg ?? null;
    if (a != null) rows.push({ stage: "arrival", value: `${kg(a)} · ${arrival!.sampleSize} cartons`, source: arrivalSource(arrival), meets: meetsTerm(term, deal, a) });
    const aMeets = meetsTerm(term, deal, a);
    // A weighbridge ticket is required evidence, so a shortfall counts whoever weighed it.
    if (aMeets === false) outcome = "below";
    else if (aMeets === true) outcome = "meets";
  }

  return {
    term,
    standard: termStandard(term, deal),
    rows,
    outcome,
    adjustmentMinor: outcome === "below" ? adjustmentFor(deal, input.trancheMinor) : 0,
  };
}

/** The check for a deal's adjustment request, from loadDeal data. */
export function claimCheckFor(data: {
  deal: CheckDeal & Pick<Deal, "depositPct" | "finalPct">;
  claim: Pick<Claim, "reason" | "appliesTo">;
  readings: (NonNullable<R> & Pick<Reading, "stage">)[];
  transitLog: Pick<TransitLog, "points"> | null;
}) {
  const gross = splitTranches(data.deal.totalMinor, data.deal.depositPct, data.deal.finalPct);
  return checkTerm({
    term: REASON_TERM[data.claim.reason] ?? null,
    deal: data.deal,
    origin: data.readings.find((r) => r.stage === "origin"),
    arrival: data.readings.find((r) => r.stage === "arrival"),
    transit: data.transitLog,
    trancheMinor: data.claim.appliesTo === "final" ? gross.final : gross.balance,
  });
}

/** Plain-English outcome, used on the timeline and in the evidence bundle. */
export const OUTCOME_TEXT: Record<Outcome, string> = {
  below: "Below the agreed term: the agreed adjustment applies",
  meets: "Meets the agreed term: no adjustment under the agreed check",
  review: "Measurements disagree: the exporter reviews the evidence",
  insufficient: "Not enough records to run the agreed check",
};

export const STAGE_LABEL: Record<Stage, string> = { dispatch: "At dispatch", transit: "In transit", arrival: "At arrival" };
export const SOURCE_LABEL: Record<Source, string> = {
  independent: "Independent",
  exporter: "Recorded by exporter",
  buyer: "Recorded by buyer",
  tracker: "Container tracker",
};

export { minWeightKg };
