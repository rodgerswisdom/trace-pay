import type { Claim, Deal } from "@/db/schema";

// The quality terms a deal can agree, and everything the adjustment flow needs to know about each:
// how the standard reads, what the buyer measures (with fixed units), the evidence required, and
// when a measurement falls below the term. Shared by the buyer's stepper, the server and the check.

export type TermKey = "dry_matter" | "temperature" | "weight";
export type MeasuredBy = "inspector" | "buyer";

type TermDeal = Pick<Deal, "minDryMatterPct" | "tempMinC" | "tempMaxC" | "weightTolerancePct" | "weightKg">;

export type Field = {
  name: "dryMatterPct" | "pulpTempC" | "netWeightKg" | "sampleSize";
  label: string;
  unit: string;
  inputMode: "decimal" | "numeric";
  /** Integer fields (counts). */
  integer?: boolean;
  min: number;
  max: number;
  helper?: string;
};

export type Requirement = { id: string; label: string; accept: "photo" | "photo_or_pdf"; optional?: boolean };

export type Measurement = Partial<Record<Field["name"], number>> & { measuredBy: MeasuredBy };

export const MIN_SAMPLE: Record<TermKey, number> = { dry_matter: 10, temperature: 5, weight: 10 };

/** Claims are stored with the older reason names; each term maps to one. */
export const TERM_REASON: Record<TermKey, Claim["reason"]> = { dry_matter: "immature", temperature: "overripe_damaged", weight: "underweight" };
export const REASON_TERM: Partial<Record<Claim["reason"], TermKey>> = { immature: "dry_matter", overripe_damaged: "temperature", underweight: "weight" };

export const minWeightKg = (deal: TermDeal) =>
  deal.weightTolerancePct != null ? Math.round(deal.weightKg * (1 - deal.weightTolerancePct / 100) * 10) / 10 : null;

export function termName(key: TermKey) {
  return key === "dry_matter" ? "Dry matter" : key === "temperature" ? "Temperature" : "Delivered weight";
}

/** "Dry matter at least 23%" */
export function termStandard(key: TermKey, deal: TermDeal) {
  if (key === "dry_matter") return `Dry matter at least ${deal.minDryMatterPct}%`;
  if (key === "temperature") return `Kept between ${deal.tempMinC} and ${deal.tempMaxC} °C`;
  return `At least ${minWeightKg(deal)!.toLocaleString("en-US")} kg (${deal.weightKg.toLocaleString("en-US")} kg less ${deal.weightTolerancePct}%)`;
}

export function termEvidenceLine(key: TermKey) {
  if (key === "dry_matter") return "Needs: a dry-matter test on at least 10 fruit, with photos";
  if (key === "temperature") return "Needs: pulp temperature of at least 5 fruit, with photos";
  return "Needs: a weighbridge ticket and a photo of the scale";
}

/** The terms this deal agreed, in a fixed order. */
export function agreedTerms(deal: TermDeal): TermKey[] {
  const out: TermKey[] = [];
  if (deal.minDryMatterPct != null) out.push("dry_matter");
  if (deal.tempMinC != null && deal.tempMaxC != null) out.push("temperature");
  if (deal.weightTolerancePct != null) out.push("weight");
  return out;
}

export function termFields(key: TermKey): Field[] {
  if (key === "dry_matter")
    return [
      { name: "dryMatterPct", label: "Dry matter", unit: "%", inputMode: "decimal", min: 5, max: 45 },
      { name: "sampleSize", label: "Sample size", unit: "fruit", inputMode: "numeric", integer: true, min: MIN_SAMPLE.dry_matter, max: 500, helper: `At least ${MIN_SAMPLE.dry_matter} fruit` },
    ];
  if (key === "temperature")
    return [
      { name: "pulpTempC", label: "Pulp temperature", unit: "°C", inputMode: "decimal", min: -5, max: 40 },
      { name: "sampleSize", label: "Fruit measured", unit: "fruit", inputMode: "numeric", integer: true, min: MIN_SAMPLE.temperature, max: 500, helper: `At least ${MIN_SAMPLE.temperature} fruit` },
    ];
  return [
    { name: "netWeightKg", label: "Delivered net weight", unit: "kg", inputMode: "decimal", min: 1, max: 1_000_000 },
    { name: "sampleSize", label: "Cartons weighed", unit: "cartons", inputMode: "numeric", integer: true, min: MIN_SAMPLE.weight, max: 100_000, helper: `At least ${MIN_SAMPLE.weight} cartons` },
  ];
}

export function termRequirements(key: TermKey, measuredBy: MeasuredBy): Requirement[] {
  const base: Requirement[] =
    key === "dry_matter"
      ? [
          { id: "reading", label: "Photo of the meter reading or test sheet", accept: "photo_or_pdf" },
          { id: "sample", label: "Photo of the cut sample fruit", accept: "photo" },
        ]
      : key === "temperature"
        ? [
            { id: "reading", label: "Photo of the probe reading", accept: "photo" },
            { id: "container", label: "Photo of the container or logger display", accept: "photo", optional: true },
          ]
        : [
            { id: "ticket", label: "Weighbridge ticket", accept: "photo_or_pdf" },
            { id: "scale", label: "Photo of the scale with cartons", accept: "photo" },
          ];
  return measuredBy === "inspector" ? [{ id: "report", label: "Inspector's report", accept: "photo_or_pdf" }, ...base] : base;
}

/** The value the term is judged on, from a measurement. */
export function measuredValue(key: TermKey, m: Partial<Measurement>) {
  return key === "dry_matter" ? m.dryMatterPct : key === "temperature" ? m.pulpTempC : m.netWeightKg;
}

/** true = meets the term, false = below it, null = can't tell (missing value or no such term). */
export function meetsTerm(key: TermKey, deal: TermDeal, value: number | null | undefined): boolean | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (key === "dry_matter") return deal.minDryMatterPct == null ? null : value >= deal.minDryMatterPct;
  if (key === "temperature") return deal.tempMinC == null || deal.tempMaxC == null ? null : value >= deal.tempMinC && value <= deal.tempMaxC;
  const min = minWeightKg(deal);
  return min == null ? null : value >= min;
}

/** The agreed adjustment: a % of the deal value, never more than the payment it comes off. */
export function adjustmentFor(deal: Pick<Deal, "totalMinor" | "breachAdjustPct">, trancheMinor: number) {
  const pct = deal.breachAdjustPct ?? 0;
  return Math.max(0, Math.min(Math.round((deal.totalMinor * pct) / 100), trancheMinor));
}

export function windowEndsAt(deal: Pick<Deal, "proofLockedAt" | "adjustWindowHours">) {
  return deal.proofLockedAt ? new Date(deal.proofLockedAt.getTime() + deal.adjustWindowHours * 3600_000) : null;
}

/** "31 hrs left", "3 days left", "Closed" */
export function timeLeftLabel(endsAt: Date, now = Date.now()) {
  const ms = endsAt.getTime() - now;
  if (ms <= 0) return "Closed";
  const hrs = Math.floor(ms / 3600_000);
  if (hrs >= 48) return `${Math.floor(hrs / 24)} days left`;
  if (hrs >= 1) return `${hrs} hr${hrs === 1 ? "" : "s"} left`;
  return `${Math.max(1, Math.floor(ms / 60_000))} min left`;
}
