// Run: pnpm exec tsx scripts/tests/check.test.ts
import { checkTerm } from "../../src/lib/claim-check";
import { adjustmentFor, agreedTerms, meetsTerm, minWeightKg, timeLeftLabel } from "../../src/lib/terms";
import { parseTrackerCsv, sampleTrackerCsv } from "../../src/lib/transit";

const deal = { minDryMatterPct: 23, tempMinC: 4.5, tempMaxC: 7, weightTolerancePct: 2, weightKg: 1500, breachAdjustPct: 10, totalMinor: 315_000 };
const r = (o: { dm?: number; pulp?: number; kg?: number; by?: "inspector" | "buyer" | "exporter"; n?: number }) => ({
  dryMatterPct: o.dm ?? null, pulpTempC: o.pulp ?? null, netWeightKg: o.kg ?? null, sampleSize: o.n ?? 10, measuredBy: o.by ?? null,
});
const clean = parseTrackerCsv(sampleTrackerCsv(new Date("2026-09-20T00:00:00Z"))).points;
const hot = clean.map(([t, c], i) => [t, i > 100 && i < 110 ? 9.2 : c] as [number, number]);

let fail = 0;
const expect = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` → got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const run = (term: "dry_matter" | "temperature" | "weight", origin: ReturnType<typeof r> | null, arrival: ReturnType<typeof r> | null, transit: { points: [number, number][] } | null = null, tranche = 189_000) =>
  checkTerm({ term, deal, origin, arrival, transit, trancheMinor: tranche });

// Dry matter
expect("DM: buyer's own low reading vs good dispatch record → review", run("dry_matter", r({ dm: 24.6, by: "exporter" }), r({ dm: 21.9, by: "buyer" })).outcome, "review");
expect("DM: inspector's low reading → below", run("dry_matter", r({ dm: 24.6, by: "exporter" }), r({ dm: 21.9, by: "inspector" })).outcome, "below");
expect("DM: low dispatch record → below", run("dry_matter", r({ dm: 22.0, by: "exporter" }), null).outcome, "below");
expect("DM: both meet → meets", run("dry_matter", r({ dm: 24.6 }), r({ dm: 24.1, by: "buyer" })).outcome, "meets");
expect("DM: no records → insufficient", run("dry_matter", null, null).outcome, "insufficient");
expect("DM: row labels", run("dry_matter", r({ dm: 24.6, by: "exporter" }), r({ dm: 21.9, by: "inspector" })).rows.map((x) => `${x.stage}:${x.source}:${x.meets}`), ["dispatch:exporter:true", "arrival:independent:false"]);
// Temperature
expect("Temp: clean tracker, warm pulp by buyer → meets", run("temperature", null, r({ pulp: 8.4, by: "buyer" }), { points: clean }).outcome, "meets");
expect("Temp: clean tracker, warm pulp by inspector → review", run("temperature", null, r({ pulp: 8.4, by: "inspector" }), { points: clean }).outcome, "review");
expect("Temp: tracker out of range → below", run("temperature", null, r({ pulp: 6, by: "buyer" }), { points: hot }).outcome, "below");
expect("Temp: no tracker, inspector warm → below", run("temperature", null, r({ pulp: 8.4, by: "inspector" })).outcome, "below");
expect("Temp: no tracker, buyer warm → review", run("temperature", null, r({ pulp: 8.4, by: "buyer" })).outcome, "review");
// Weight
expect("Weight: min is 1,470 kg", minWeightKg(deal), 1470);
expect("Weight: 1,400 kg delivered → below", run("weight", null, r({ kg: 1400, by: "buyer" })).outcome, "below");
expect("Weight: 1,480 kg delivered → meets", run("weight", null, r({ kg: 1480, by: "buyer" })).outcome, "meets");
// Money
expect("Adjustment: 10% of USD 3,150", run("dry_matter", r({ dm: 22 }), null).adjustmentMinor, 31_500);
expect("Adjustment capped at the payment it comes off", run("dry_matter", r({ dm: 22 }), null, null, 20_000).adjustmentMinor, 20_000);
expect("Adjustment only when below", run("dry_matter", r({ dm: 24.6 }), r({ dm: 24.1 })).adjustmentMinor, 0);
expect("adjustmentFor never negative", adjustmentFor(deal, 0), 0);
// Terms helpers
expect("agreedTerms", agreedTerms(deal), ["dry_matter", "temperature", "weight"]);
expect("agreedTerms without weight", agreedTerms({ ...deal, weightTolerancePct: null }), ["dry_matter", "temperature"]);
expect("meetsTerm temp range edges", [meetsTerm("temperature", deal, 4.5), meetsTerm("temperature", deal, 7), meetsTerm("temperature", deal, 7.1)], [true, true, false]);
expect("unknown term → insufficient", checkTerm({ term: null, deal, trancheMinor: 1 }).outcome, "insufficient");
const now = Date.parse("2026-09-28T12:00:00Z");
expect("timeLeft hours", timeLeftLabel(new Date(now + 31 * 3600_000 + 60_000), now), "31 hrs left");
expect("timeLeft days", timeLeftLabel(new Date(now + 100 * 3600_000), now), "4 days left");
expect("timeLeft closed", timeLeftLabel(new Date(now - 1), now), "Closed");
process.exit(fail ? 1 : 0);
