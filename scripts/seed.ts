import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, type Tx } from "../src/db";
import { claims, deals, events, exporters, files, payments, payoutAccounts, proofItems, readings, transitLogs, withdrawals, type EvidenceItem } from "../src/db/schema";
import { parseTrackerCsv, sampleTrackerCsv, summarize } from "../src/lib/transit";
import { appUrl } from "../src/lib/urls";

// Seeds the demo exporter and a few sample deals. Safe to re-run: deals are only added
// when the demo exporter has none. `pnpm db:reset` wipes and reseeds.
// Sample payments use SAMPLE- references so they're never mistaken for real Payaza ones.

const token = () => randomBytes(32).toString("base64url");
const at = (daysAgo: number, hh: number, mm: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hh - 3, mm, 0, 0); // hh given in East Africa Time (UTC+3)
  return d;
};
const dateOnly = (daysAhead: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
};

async function main() {
  const email = (process.env.SEED_EXPORTER_EMAIL ?? "demo@tracepay.test").toLowerCase();
  const password = process.env.SEED_EXPORTER_PASSWORD ?? "avocado2026";
  const baseUrl = appUrl();

  await db
    .insert(exporters)
    .values({
      businessName: "Kandara Hass Growers Co-op",
      contactName: "Wanjiru Kamau",
      email,
      phone: "+254 712 000 000",
      passwordHash: await bcrypt.hash(password, 10),
      settlementBank: "Equity Bank Kenya",
      settlementAccount: "•••• 4821",
      language: "en",
    })
    .onConflictDoNothing({ target: exporters.email });

  const exporter = (await db.query.exporters.findFirst({ where: eq(exporters.email, email) }))!;
  console.log(`Demo exporter: ${email} / ${password}`);

  const existing = await db.query.deals.findMany({ where: eq(deals.exporterId, exporter.id) });
  if (existing.length > 0) {
    console.log(`Already has ${existing.length} deal(s); skipping sample deals. Run \`pnpm db:reset\` to start fresh.`);
    await seedGettingPaid(exporter.id);
    return;
  }

  // Quality terms agreed on every sample deal.
  const base = {
    exporterId: exporter.id,
    product: "Hass",
    minDryMatterPct: 23,
    tempMinC: 4.5,
    tempMaxC: 7,
    weightTolerancePct: 2,
    breachAdjustPct: 10,
    adjustWindowHours: 120,
  };

  await db.transaction(async (tx) => {
    // 1. Waiting for deposit — the numbers from the spec: 1,500 kg × USD 2.10, 30% deposit.
    const dubai = {
      ...base,
      seq: 926,
      finalPct: 10,
      buyerCompany: "Al Noor Fresh Trading LLC",
      buyerContact: "Omar Haddad",
      buyerEmail: "omar@alnoor.example",
        buyerPhone: "+971500000101",
      weightKg: 1500,
      pricePerKgMinor: 210,
      currency: "USD",
      totalMinor: 315_000,
      depositPct: 30,
      destination: "Dubai",
      dispatchDate: dateOnly(6),
      buyerToken: token(),
      createdAt: at(0, 9, 5),
    };
    const [d1] = await tx.insert(deals).values(dubai).returning();
    await tx.insert(events).values({
      dealId: d1.id,
      actor: "exporter",
      type: "deal_created",
      summary: "Deal created · USD 3,150 · deposit USD 945 (30%), balance USD 1,890 after proof, final USD 315 on arrival",
      createdAt: dubai.createdAt,
    });

    // 2. Deposit paid — ready for proof of dispatch (the "pre-paid" fallback deal).
    const rotterdam = {
      ...base,
      seq: 927,
      buyerCompany: "Van Dijk Fruit Import B.V.",
      buyerContact: "Sanne van Dijk",
      buyerEmail: "sanne@vandijkfruit.example",
        buyerPhone: "+31600000202",
      weightKg: 2000,
      pricePerKgMinor: 195,
      currency: "EUR",
      totalMinor: 390_000,
      depositPct: 30,
      destination: "Rotterdam",
      dispatchDate: dateOnly(2),
      status: "deposit_paid" as const,
      buyerToken: token(),
      createdAt: at(3, 11, 20),
    };
    const [d2] = await tx.insert(deals).values(rotterdam).returning();
    const fxEur = Number(process.env.FX_EUR_KES ?? 144.5);
    const paidAt = at(2, 10, 14);
    await tx.insert(payments).values({
      dealId: d2.id,
      kind: "deposit",
      amountMinor: 117_000,
      currency: "EUR",
      status: "paid",
      merchantReference: "TP-0927-D-sample01",
      payazaReference: "SAMPLE-PZ-0927-DEP",
      fxRate: fxEur,
      kesAmountMinor: Math.round(117_000 * fxEur),
      paidAt,
      createdAt: at(2, 10, 9),
    });
    await tx.insert(events).values([
      {
        dealId: d2.id,
        actor: "exporter",
        type: "deal_created",
        summary: "Deal created · EUR 3,900 · deposit EUR 1,170 (30%), balance EUR 2,730 after proof",
        createdAt: rotterdam.createdAt,
      },
      {
        dealId: d2.id,
        actor: "payaza",
        type: "deposit_paid",
        summary: `Buyer paid deposit · EUR 1,170 · KES ${Math.round(1170 * fxEur).toLocaleString("en-US")} (sample data)`,
        data: { ref: "SAMPLE-PZ-0927-DEP", sample: true },
        createdAt: paidAt,
      },
    ]);

    // 3. Cancelled before deposit.
    const doha = {
      ...base,
      seq: 925,
      product: "Fuerte",
      buyerCompany: "Gulf Harvest Foods W.L.L.",
      buyerContact: "Fatima Al-Kuwari",
      buyerEmail: "fatima@gulfharvest.example",
        buyerPhone: "+97430000303",
      weightKg: 800,
      pricePerKgMinor: 180,
      currency: "USD",
      totalMinor: 144_000,
      depositPct: 50,
      destination: "Doha",
      dispatchDate: dateOnly(-4),
      status: "cancelled" as const,
      buyerToken: token(),
      createdAt: at(9, 15, 40),
    };
    const [d3] = await tx.insert(deals).values(doha).returning();
    await tx.insert(events).values([
      {
        dealId: d3.id,
        actor: "exporter",
        type: "deal_created",
        summary: "Deal created · USD 1,440 · deposit USD 720 (50%), balance USD 720 after proof",
        createdAt: doha.createdAt,
      },
      {
        dealId: d3.id,
        actor: "exporter",
        type: "cancelled",
        summary: "Exporter cancelled the deal before the deposit",
        createdAt: at(7, 8, 2),
      },
    ]);

    // Shared helpers for the richer sample history below.
    const fxUsd = Number(process.env.FX_USD_KES ?? 129.2);
    const pay = (
      dealId: string,
      kind: "deposit" | "balance",
      amountMinor: number,
      currency: string,
      fx: number,
      ref: string,
      paidAt: Date,
    ) =>
      tx.insert(payments).values({
        dealId,
        kind,
        amountMinor,
        currency,
        status: "paid",
        merchantReference: `TP-${ref.split("-")[0]}-${kind === "deposit" ? "D" : "B"}-sample`,
        payazaReference: `SAMPLE-PZ-${ref}`,
        fxRate: fx,
        kesAmountMinor: Math.round(amountMinor * fx),
        paidAt,
        createdAt: paidAt,
      });
    const ev = (dealId: string, actor: "exporter" | "buyer" | "payaza" | "system", type: string, summary: string, createdAt: Date) =>
      ({ dealId, actor, type, summary, createdAt });

    // 4. Repeat buyer, claim open: "fruit arrived immature", USD 1,000 off asked — the demo's claim.
    const [d4] = await tx
      .insert(deals)
      .values({
        ...base,
        seq: 928,
        buyerCompany: "Al Noor Fresh Trading LLC",
        buyerContact: "Omar Haddad",
        buyerEmail: "omar@alnoor.example",
        buyerPhone: "+971500000101",
        weightKg: 1200,
        pricePerKgMinor: 220,
        currency: "USD",
        totalMinor: 264_000,
        depositPct: 30,
        destination: "Dubai",
        dispatchDate: dateOnly(-5),
        status: "claim_open",
        buyerToken: token(),
        createdAt: at(10, 8, 30),
      })
      .returning();
    await pay(d4.id, "deposit", 79_200, "USD", fxUsd, "0928-DEP", at(8, 14, 2));
    await attachSampleProof(tx, d4.id, "TP-0928", at(5, 16, 40), { dryMatter: "24.6", temp: "5.4", inspection: true });
    const t4 = await attachSampleTransit(tx, d4.id, "TP-0928", at(5, 15, 0));
    // The buyer's own reading is below the term but contradicts the dispatch record: the exporter reviews.
    await recordArrival(tx, d4.id, at(1, 11, 20), { dm: 21.9, pulp: null, sample: 12 });
    await tx.insert(claims).values({
      dealId: d4.id,
      reason: "immature",
      description: "Dry matter below the agreed term: dry matter 21.9% (12 fruit), measured by the buyer.",
      amountRequestedMinor: 26_400, // 10% of USD 2,640, per the agreed terms
      measuredBy: "buyer",
      evidence: [
        await sampleEvidence(tx, d4.id, "reading", "Dry-matter meter reading", ["TP-0928 · on arrival", "Mean 21.9% (12 fruit)"], "#dcfce7", at(1, 11, 10)),
        await sampleEvidence(tx, d4.id, "sample", "Cut sample fruit", ["TP-0928 · on arrival", "12 fruit, halved"], "#fef9c3", at(1, 11, 12)),
      ],
      createdAt: at(1, 11, 25),
    });
    await tx.insert(events).values([
      ev(d4.id, "exporter", "deal_created", "Deal created · USD 2,640 · deposit USD 792 (30%), balance USD 1,848 after proof", at(10, 8, 30)),
      ev(d4.id, "payaza", "deposit_paid", `Buyer paid deposit · USD 792 · KES ${Math.round(792 * fxUsd).toLocaleString("en-US")} (sample data)`, at(8, 14, 2)),
      ev(d4.id, "exporter", "proof_attached", "Proof of dispatch attached · balance of USD 1,848 requested", at(5, 16, 40)),
      ev(d4.id, "exporter", "transit_log_attached", t4, at(3, 9, 30)),
      ev(d4.id, "buyer", "adjustment_requested", "Buyer requested an adjustment · dry matter · dry matter 21.9% (12 fruit), measured by buyer · 2 files · USD 264 per the agreed terms (sample data)", at(1, 11, 25)),
      ev(d4.id, "system", "on_hold", "Balance on hold while the exporter reviews", at(1, 11, 25)),
      ev(d4.id, "system", "adjustment_check", "Agreed check: Measurements disagree: the exporter reviews the evidence", at(1, 11, 25)),
    ]);

    // 5. Same buyer, earlier deal: paid in full, and the exporter has withdrawn it.
    const [d5] = await tx
      .insert(deals)
      .values({
        ...base,
        seq: 924,
        buyerCompany: "Al Noor Fresh Trading LLC",
        buyerContact: "Omar Haddad",
        buyerEmail: "omar@alnoor.example",
        buyerPhone: "+971500000101",
        weightKg: 1000,
        pricePerKgMinor: 205,
        currency: "USD",
        totalMinor: 205_000,
        depositPct: 30,
        destination: "Dubai",
        dispatchDate: dateOnly(-18),
        status: "balance_paid",
        buyerToken: token(),
        createdAt: at(24, 10, 0),
      })
      .returning();
    await pay(d5.id, "deposit", 61_500, "USD", fxUsd, "0924-DEP", at(22, 9, 41));
    await attachSampleProof(tx, d5.id, "TP-0924", at(18, 17, 5), { dryMatter: "25.1" });
    await attachSampleTransit(tx, d5.id, "TP-0924", at(18, 16, 0));
    await recordArrival(tx, d5.id, at(16, 8, 40), { dm: 25.0, pulp: 5.9, sample: 10 });
    await pay(d5.id, "balance", 143_500, "USD", fxUsd, "0924-BAL", at(15, 13, 12));
    await tx.insert(events).values([
      ev(d5.id, "exporter", "deal_created", "Deal created · USD 2,050 · deposit USD 615 (30%), balance USD 1,435 after proof", at(24, 10, 0)),
      ev(d5.id, "payaza", "deposit_paid", `Buyer paid deposit · USD 615 · KES ${Math.round(615 * fxUsd).toLocaleString("en-US")} (sample data)`, at(22, 9, 41)),
      ev(d5.id, "exporter", "proof_attached", "Proof of dispatch attached · balance of USD 1,435 requested", at(18, 17, 5)),
      ev(d5.id, "payaza", "balance_paid", `Buyer paid balance · USD 1,435 · KES ${Math.round(1435 * fxUsd).toLocaleString("en-US")} (sample data)`, at(15, 13, 12)),
    ]);

    // 6. Repeat buyer, claim resolved with a counter-offer, balance paid.
    const [d6] = await tx
      .insert(deals)
      .values({
        ...base,
        seq: 929,
        buyerCompany: "Van Dijk Fruit Import B.V.",
        buyerContact: "Sanne van Dijk",
        buyerEmail: "sanne@vandijkfruit.example",
        buyerPhone: "+31600000202",
        weightKg: 1800,
        pricePerKgMinor: 200,
        currency: "EUR",
        totalMinor: 360_000,
        depositPct: 30,
        destination: "Rotterdam",
        dispatchDate: dateOnly(-12),
        status: "balance_paid",
        buyerToken: token(),
        createdAt: at(16, 9, 15),
      })
      .returning();
    await pay(d6.id, "deposit", 108_000, "EUR", fxEur, "0929-DEP", at(15, 12, 20));
    await attachSampleProof(tx, d6.id, "TP-0929", at(12, 15, 30), { dryMatter: "23.9", temp: "5.8" });
    const t6 = await attachSampleTransit(tx, d6.id, "TP-0929", at(12, 14, 0));
    // Pulp was warm on arrival, but the tracker shows the container stayed in range: meets the term.
    await recordArrival(tx, d6.id, at(6, 10, 0), { dm: null, pulp: 8.4, sample: 8 });
    await tx.insert(claims).values({
      dealId: d6.id,
      reason: "overripe_damaged",
      description: "Temperature below the agreed term: pulp 8.4 °C (8 fruit), measured by the buyer.",
      amountRequestedMinor: 36_000, // 10% of EUR 3,600, per the agreed terms
      measuredBy: "buyer",
      evidence: [await sampleEvidence(tx, d6.id, "reading", "Probe reading", ["TP-0929 · on arrival", "Pulp 8.4 °C (8 fruit)"], "#ffedd5", at(6, 9, 55))],
      status: "countered",
      responseNote: "Loading photos and temperature log show good condition at dispatch; offering EUR 200 as goodwill.",
      agreedAmountMinor: 20_000,
      createdAt: at(6, 10, 5),
      respondedAt: at(5, 18, 40),
    });
    await pay(d6.id, "balance", 232_000, "EUR", fxEur, "0929-BAL", at(3, 9, 55));
    await tx.insert(events).values([
      ev(d6.id, "exporter", "deal_created", "Deal created · EUR 3,600 · deposit EUR 1,080 (30%), balance EUR 2,520 after proof", at(16, 9, 15)),
      ev(d6.id, "payaza", "deposit_paid", `Buyer paid deposit · EUR 1,080 · KES ${Math.round(1080 * fxEur).toLocaleString("en-US")} (sample data)`, at(15, 12, 20)),
      ev(d6.id, "exporter", "proof_attached", "Proof of dispatch attached · balance of EUR 2,520 requested", at(12, 15, 30)),
      ev(d6.id, "exporter", "transit_log_attached", t6, at(10, 9, 0)),
      ev(d6.id, "buyer", "adjustment_requested", "Buyer requested an adjustment · temperature · pulp 8.4 °C (8 fruit), measured by buyer · 1 file · EUR 360 per the agreed terms (sample data)", at(6, 10, 5)),
      ev(d6.id, "system", "on_hold", "Balance on hold while the exporter reviews", at(6, 10, 5)),
      ev(d6.id, "system", "adjustment_check", "Agreed check: Meets the agreed term: no adjustment under the agreed check", at(6, 10, 5)),
      ev(d6.id, "exporter", "adjustment_countered", "Exporter confirmed EUR 200 off instead of EUR 360 · new balance EUR 2,320", at(5, 18, 40)),
      ev(d6.id, "payaza", "balance_paid", `Buyer paid balance · EUR 2,320 · KES ${Math.round(2320 * fxEur).toLocaleString("en-US")} (sample data)`, at(3, 9, 55)),
    ]);

    console.log("Sample deals:");
    for (const d of [d5, d3, d1, d2, d4, d6]) {
      console.log(`  TP-${String(d.seq).padStart(4, "0")}  ${d.status.padEnd(16)} buyer link: ${baseUrl}/b/${d.buyerToken}`);
    }
  });
  await seedGettingPaid(exporter.id);
}

/** Where the demo exporter gets paid, added once (also to an existing database). */
async function seedGettingPaid(exporterId: string) {
  if (await db.query.payoutAccounts.findFirst({ where: eq(payoutAccounts.exporterId, exporterId) })) return;
  const exporter = { id: exporterId };
  const fxUsd = Number(process.env.FX_USD_KES ?? 129.2);
  // Where the exporter gets paid: a bank account in use for weeks, and an M-Pesa number added
  // two hours ago, still on its 24-hour hold. Sample numbers.
  const [equity] = await db
    .insert(payoutAccounts)
    .values({
      exporterId: exporter.id,
      type: "bank",
      provider: "Equity Bank",
      bankCode: "68",
      accountNumber: "0000000004821",
      last4: "4821",
      accountName: "Kandara Hass Growers Co-op",
      isDefault: true,
      activeAt: at(29, 9, 0),
      createdAt: at(30, 9, 0),
    })
    .returning();
  const heldSince = new Date(Date.now() - 2 * 3_600_000);
  await db.insert(payoutAccounts).values({
    exporterId: exporter.id,
    type: "mpesa_phone",
    provider: "M-Pesa",
    accountNumber: "254712000678",
    last4: "0678",
    accountName: "Wanjiru Kamau",
    activeAt: new Date(heldSince.getTime() + 24 * 3_600_000),
    createdAt: heldSince,
  });
  // TP-0924's money, withdrawn after the balance came in (sample: no money moved).
  const fee = 50_00;
  await db.insert(withdrawals).values({
    exporterId: exporter.id,
    payoutAccountId: equity.id,
    amountMinor: 205_000,
    currency: "USD",
    fxRate: fxUsd,
    feeMinor: fee,
    receiveMinor: Math.floor((205_000 * fxUsd) / 100) * 100 - fee,
    status: "received",
    reference: "SAMPLE-W-0924",
    payazaReference: "SAMPLE-PZ-W-0924",
    practice: true,
    createdAt: at(14, 10, 0),
    sentAt: at(14, 10, 0),
    receivedAt: at(14, 11, 20),
  });

  console.log("Sample payout accounts added.");
}

// ---- Sample proof files -------------------------------------------------------------------
// Clearly watermarked placeholders, never anything resembling a real certificate. Replace the
// loading photos with real avocado photos for the demo. Written straight to the files table
// (scripts can't import the server-only storage module).


function sampleSvg(title: string, lines: string[], tint: string) {
  const esc = (t: string) => t.replace(/[<>&"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const body = lines.map((l, i) => `<text x="60" y="${250 + i * 44}" font-size="28" fill="#1f2937">${esc(l)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
<rect width="800" height="600" fill="${tint}"/>
<rect x="30" y="30" width="740" height="540" rx="18" fill="#ffffff" opacity="0.9"/>
<text x="60" y="120" font-size="40" font-weight="700" fill="#14532d" font-family="sans-serif">${esc(title)}</text>
<text x="60" y="170" font-size="22" fill="#6b7280" font-family="sans-serif">TRACE Pay demo document</text>
<g font-family="sans-serif">${body}</g>
<text x="400" y="360" font-size="120" font-weight="800" fill="#dc2626" opacity="0.18" text-anchor="middle" transform="rotate(-24 400 360)" font-family="sans-serif">SAMPLE</text>
</svg>`;
}

async function attachSampleProof(
  tx: Tx,
  dealId: string,
  number: string,
  lockedAt: Date,
  opts: { dryMatter: string; temp?: string; inspection?: boolean },
) {
  type Item = { type: (typeof proofItems.$inferInsert)["type"]; source: "exporter" | "independent"; title: string; lines: string[]; tint: string; value?: string; issuer?: string };
  const items: Item[] = [
    { type: "dry_matter", source: "exporter", title: "Dry-matter test sheet", lines: [`Deal ${number}`, `Mean dry matter: ${opts.dryMatter}%`, "10 fruit sampled, oven method"], tint: "#dcfce7", value: opts.dryMatter },
    { type: "phyto", source: "exporter", title: "Phytosanitary certificate", lines: [`Deal ${number}`, "Placeholder for the KEPHIS certificate", "Not a real certificate"], tint: "#e0f2fe" },
    { type: "loading_photo", source: "exporter", title: "Loading photo 1", lines: [`Deal ${number}`, "Cartons palletised at packhouse", "Replace with a real photo"], tint: "#fef9c3" },
    { type: "loading_photo", source: "exporter", title: "Loading photo 2", lines: [`Deal ${number}`, "Pallets loaded into reefer", "Replace with a real photo"], tint: "#fef9c3" },
    { type: "airway_bill", source: "exporter", title: "Airway bill", lines: [`Deal ${number}`, "Placeholder airway bill", "Not a real document"], tint: "#f3e8ff" },
  ];
  if (opts.inspection) {
    items.push({ type: "inspection_report", source: "independent", title: "Pre-shipment inspection", lines: [`Deal ${number}`, `Dry matter ${opts.dryMatter}% · pulp 5.6°C`, "Condition: sound, uniform colour"], tint: "#e0e7ff", issuer: "Sample Surveyors Ltd (demo)" });
  }
  if (opts.temp) {
    items.push({ type: "temperature_log", source: "exporter", title: "Temperature log", lines: [`Deal ${number}`, `Reading at loading: ${opts.temp}°C`, "Reefer set point 5°C"], tint: "#ffedd5", value: opts.temp });
  }

  for (const [i, it] of items.entries()) {
    const id = crypto.randomUUID();
    const fileName = `sample-${it.type.replace(/_/g, "-")}${it.type === "loading_photo" ? `-${i - 1}` : ""}.svg`;
    const fileKey = `deals/${dealId}/${id}-${fileName}`;
    const bytes = Buffer.from(sampleSvg(it.title, it.lines, it.tint));
    await tx.insert(files).values({ key: fileKey, bytes, contentType: "image/svg+xml", sizeBytes: bytes.byteLength });
    await tx.insert(proofItems).values({
      id,
      dealId,
      type: it.type,
      source: it.source,
      issuer: it.issuer ?? null,
      value: it.value ?? null,
      fileKey,
      fileName,
      contentType: "image/svg+xml",
      sizeBytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      receivedAt: new Date(lockedAt.getTime() - (items.length - i) * 4 * 60_000),
      createdAt: new Date(lockedAt.getTime() - (items.length - i) * 4 * 60_000),
    });
    if (it.type === "dry_matter") {
      await tx.insert(readings).values({
        dealId,
        stage: "origin",
        recordedBy: "exporter",
        measuredBy: "exporter",
        dryMatterPct: Number(it.value),
        sampleSize: 10,
        device: "F-750 NIR meter",
        pulpTempC: opts.temp ? Number(opts.temp) : null,
        proofItemId: id,
        recordedAt: new Date(lockedAt.getTime() - (items.length - i) * 4 * 60_000),
      });
    }
  }
  // Lock only after the items are in: the database refuses proof changes on a locked deal.
  await tx.update(deals).set({ proofLockedAt: lockedAt }).where(eq(deals.id, dealId));
}

/** The labelled sample tracker feed, attached after dispatch. Returns the timeline summary. */
async function attachSampleTransit(tx: Tx, dealId: string, number: string, start: Date) {
  const text = sampleTrackerCsv(start, 52, number);
  const parsed = parseTrackerCsv(text);
  const sum = summarize(parsed.points, { min: 4.5, max: 7 });
  const fileName = `SAMPLE-tracker-${number}.csv`;
  const fileKey = `deals/${dealId}/transit/${crypto.randomUUID()}-${fileName}`;
  const bytes = Buffer.from(text);
  await tx.insert(files).values({ key: fileKey, bytes, contentType: "text/csv", sizeBytes: bytes.byteLength });
  await tx.insert(transitLogs).values({
    dealId,
    fileKey,
    fileName,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    device: parsed.device,
    points: parsed.points,
    count: sum.count,
    minC: sum.minC,
    maxC: sum.maxC,
    startAt: new Date(sum.startAt),
    endAt: new Date(sum.endAt),
    isSample: true,
    receivedAt: new Date(sum.endAt + 30 * 60_000),
  });
  return `Transit log attached (sample feed) · ${sum.count} readings · ${sum.minC.toFixed(1)}–${sum.maxC.toFixed(1)} °C · always inside the agreed 4.5–7 °C`;
}

async function recordArrival(tx: Tx, dealId: string, when: Date, r: { dm: number | null; pulp: number | null; sample: number }) {
  await tx.insert(readings).values({
    dealId,
    stage: "arrival",
    recordedBy: "buyer",
    measuredBy: "buyer",
    dryMatterPct: r.dm,
    sampleSize: r.sample,
    device: "Buyer's own test",
    pulpTempC: r.pulp,
    recordedAt: when,
  });
  await tx.update(deals).set({ arrivedAt: when }).where(eq(deals.id, dealId));
}

/** A watermarked SAMPLE evidence photo from the buyer, stored like a real upload. */
async function sampleEvidence(tx: Tx, dealId: string, requirement: string, title: string, lines: string[], tint: string, when: Date): Promise<EvidenceItem> {
  const key = `deals/${dealId}/claims/${crypto.randomUUID()}-sample-${requirement}.svg`;
  const bytes = Buffer.from(sampleSvg(title, lines, tint));
  await tx.insert(files).values({ key, bytes, contentType: "image/svg+xml", sizeBytes: bytes.byteLength });
  return { requirement, key, contentType: "image/svg+xml", fileName: `sample-${requirement}.svg`, receivedAt: when.toISOString() };
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
