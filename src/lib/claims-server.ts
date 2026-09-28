import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { claims, deals, payments, readings, transitLogs, type Deal, type EvidenceItem } from "@/db/schema";
import { OUTCOME_TEXT, claimCheckFor } from "./claim-check";
import { CLAIM_PHOTO_TYPES, agreedFor, contentTypeForKey, type Decision } from "./claims";
import { amountsDue, recordEvent } from "./deals";
import { both, fmt, kesRate } from "./money";
import { MAX_UPLOAD_BYTES } from "./proof";
import { getObject, putObject, safeName } from "./storage";
import {
  TERM_REASON,
  adjustmentFor,
  agreedTerms,
  measuredValue,
  meetsTerm,
  termFields,
  termName,
  termRequirements,
  windowEndsAt,
  type MeasuredBy,
  type TermKey,
} from "./terms";

export class ClaimError extends Error {}

/**
 * Where the buyer can act on arrival: after dispatch (proof locked), before arrival is confirmed,
 * while a payment is still due.
 */
async function dealOnArrival(token: string) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.buyerToken, token) });
  if (!deal) throw new ClaimError("Deal not found.");
  if (deal.arrivedAt) throw new ClaimError("Delivery has already been confirmed on this deal.");
  if (!deal.proofLockedAt || !["proof_attached", "awaiting_arrival"].includes(deal.status)) {
    throw new ClaimError("This step opens once the fruit is dispatched and a payment is still due.");
  }
  return deal;
}

/** The unpaid payment an adjustment would come off: the balance, or the final payment once the balance is paid. */
async function heldTranche(deal: Deal) {
  const paid = await db.query.payments.findMany({ where: and(eq(payments.dealId, deal.id), inArray(payments.status, ["paid", "settled"])) });
  const due = amountsDue(deal);
  const appliesTo: "balance" | "final" = paid.some((p) => p.kind === "balance") ? "final" : "balance";
  return { appliesTo, amount: appliesTo === "final" ? due.final : due.balance };
}

const evidencePrefix = (dealId: string) => `deals/${dealId}/claims/`;

/** One evidence file, uploaded before the request is sent. Returns the storage key. */
export async function uploadClaimPhoto(token: string, file: File) {
  const deal = await dealOnArrival(token);
  if (windowEndsAt(deal)! < new Date()) throw new ClaimError("The window for adjustments has closed.");
  const ext = CLAIM_PHOTO_TYPES[file.type];
  if (!ext) throw new ClaimError("Use a photo (JPEG, PNG, WebP) or a PDF.");
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) throw new ClaimError("The file is empty or larger than 4 MB.");
  const base = safeName(file.name).replace(/\.[^.]+$/, "");
  const key = `${evidencePrefix(deal.id)}${crypto.randomUUID()}-${base}.${ext}`;
  await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type);
  return key;
}

/** Arrival without an adjustment: confirm delivery. Requests the final payment if there is one. */
export async function acceptDelivery(token: string) {
  const deal = await dealOnArrival(token);
  const due = amountsDue(deal);
  const rate = kesRate(deal.currency);
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(deals)
      .set({ arrivedAt: new Date(), ...(deal.status === "awaiting_arrival" && due.final > 0 ? { status: "final_due" as const } : {}) })
      .where(and(eq(deals.id, deal.id), eq(deals.status, deal.status)))
      .returning();
    if (!updated) throw new ClaimError("This deal changed. Reload and try again.");
    await recordEvent(tx, deal.id, "buyer", "delivery_accepted", "Buyer accepted delivery");
    if (updated.status === "final_due") {
      await recordEvent(tx, deal.id, "system", "final_requested", `Final payment requested from buyer · ${both(due.final, deal.currency, rate)}`);
    }
  });
}

export type AdjustmentInput = {
  term: string;
  measuredBy: string;
  measurement: Record<string, number | undefined>;
  evidence: { requirement: string; key: string; fileName: string }[];
  confirmed: boolean;
};

/**
 * The buyer's adjustment request. Everything is checked here, whatever the screen allowed: an agreed term,
 * a complete measurement below that term, a large enough sample, the required evidence, and the window.
 * The amount isn't typed: it comes from the agreed terms.
 */
export async function requestAdjustment(token: string, input: AdjustmentInput) {
  const deal = await dealOnArrival(token);
  const ends = windowEndsAt(deal)!;
  if (ends < new Date()) throw new ClaimError("The window for adjustments has closed.");

  const term = input.term as TermKey;
  if (!agreedTerms(deal).includes(term)) throw new ClaimError("Choose one of the terms agreed for this deal.");
  const measuredBy = input.measuredBy as MeasuredBy;
  if (measuredBy !== "inspector" && measuredBy !== "buyer") throw new ClaimError("Say who took the measurement.");

  const m: Record<string, number> = {};
  for (const f of termFields(term)) {
    const v = input.measurement[f.name];
    if (v == null || !Number.isFinite(v) || (f.integer && !Number.isInteger(v)) || v < f.min || v > f.max) {
      throw new ClaimError(f.name === "sampleSize" ? `${f.label}: ${f.helper}.` : `Enter the ${f.label.toLowerCase()} in ${f.unit}.`);
    }
    m[f.name] = v;
  }
  if (meetsTerm(term, deal, measuredValue(term, m)) !== false) {
    throw new ClaimError("This measurement meets the agreed term, so no adjustment applies.");
  }

  const reqs = termRequirements(term, measuredBy);
  const evidence: EvidenceItem[] = [];
  const now = new Date();
  for (const r of reqs) {
    const files = input.evidence.filter((e) => e.requirement === r.id);
    if (files.length === 0 && !r.optional) throw new ClaimError(`Add: ${r.label}.`);
    for (const f of files.slice(0, 4)) {
      if (!f.key.startsWith(evidencePrefix(deal.id)) || f.key.includes("..") || !(await getObject(f.key))) {
        throw new ClaimError(`A file for "${r.label}" didn't upload. Add it again.`);
      }
      evidence.push({ requirement: r.id, key: f.key, contentType: contentTypeForKey(f.key), fileName: f.fileName.slice(0, 120), receivedAt: now.toISOString() });
    }
  }
  if (!input.confirmed) throw new ClaimError("Confirm that the measurements and photos are accurate.");

  const held = await heldTranche(deal);
  if (held.amount <= 0) throw new ClaimError("The balance is already paid, so there's nothing left to adjust.");
  const amount = adjustmentFor(deal, held.amount);
  if (amount <= 0) throw new ClaimError("The agreed terms don't set an adjustment amount for this deal.");

  const rate = kesRate(deal.currency);
  const who = measuredBy === "inspector" ? "inspector" : "buyer";
  const summary =
    term === "dry_matter"
      ? `dry matter ${m.dryMatterPct.toFixed(1)}% (${m.sampleSize} fruit)`
      : term === "temperature"
        ? `pulp ${m.pulpTempC.toFixed(1)} °C (${m.sampleSize} fruit)`
        : `${m.netWeightKg.toLocaleString("en-US")} kg delivered (${m.sampleSize} cartons weighed)`;

  const claimId = await db.transaction(async (tx) => {
    const [arrived] = await tx
      .update(deals)
      .set({ arrivedAt: now, status: "claim_open" })
      .where(and(eq(deals.id, deal.id), eq(deals.status, deal.status)))
      .returning();
    if (!arrived) throw new ClaimError("This deal changed. Reload and try again.");
    await tx.insert(readings).values({
      dealId: deal.id,
      stage: "arrival",
      recordedBy: "buyer",
      measuredBy,
      dryMatterPct: m.dryMatterPct ?? null,
      pulpTempC: m.pulpTempC ?? null,
      netWeightKg: m.netWeightKg ?? null,
      sampleSize: m.sampleSize,
      device: measuredBy === "inspector" ? "Independent inspector" : "Buyer's own test",
      recordedAt: now,
    });
    const [claim] = await tx
      .insert(claims)
      .values({
        dealId: deal.id,
        reason: TERM_REASON[term],
        description: `${termName(term)} below the agreed term: ${summary}, measured by ${who === "inspector" ? "an independent inspector" : "the buyer"}.`,
        photoKeys: [],
        evidence,
        measuredBy,
        amountRequestedMinor: amount,
        appliesTo: held.appliesTo,
      })
      .returning();
    await recordEvent(
      tx,
      deal.id,
      "buyer",
      "adjustment_requested",
      `Buyer requested an adjustment · ${termName(term).toLowerCase()} · ${summary}, measured by ${who} · ${evidence.length} file${evidence.length === 1 ? "" : "s"} · ${both(amount, deal.currency, rate)} per the agreed terms`,
    );
    await recordEvent(tx, deal.id, "system", "on_hold", `${held.appliesTo === "final" ? "Final payment" : "Balance"} on hold while the exporter reviews`);
    await recordCheck(tx, deal.id);
    return claim.id;
  });
  return { claimId };
}

async function recordCheck(tx: Tx, dealId: string) {
  const [deal] = await tx.select().from(deals).where(eq(deals.id, dealId));
  const [claim] = await tx.select().from(claims).where(and(eq(claims.dealId, dealId), eq(claims.status, "open")));
  if (!deal || !claim) return;
  const dealReadings = await tx.select().from(readings).where(eq(readings.dealId, dealId));
  const [log] = await tx.select().from(transitLogs).where(eq(transitLogs.dealId, dealId));
  const check = claimCheckFor({ deal, claim, readings: dealReadings, transitLog: log ?? null });
  await recordEvent(tx, dealId, "system", "adjustment_check", `Agreed check: ${OUTCOME_TEXT[check.outcome]}`, { outcome: check.outcome, rows: check.rows });
}

/** The buyer withdraws an open request. The held payment is due again. */
export async function withdrawAdjustment(token: string) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.buyerToken, token) });
  if (!deal || deal.status !== "claim_open") throw new ClaimError("There's no open request to withdraw.");
  const claim = await db.query.claims.findFirst({ where: and(eq(claims.dealId, deal.id), eq(claims.status, "open")) });
  if (!claim) throw new ClaimError("There's no open request to withdraw.");
  const due = amountsDue(deal);
  const next = claim.appliesTo === "final" ? (due.final > 0 ? "final_due" : "balance_paid") : "proof_attached";
  await db.transaction(async (tx) => {
    const [w] = await tx
      .update(claims)
      .set({ status: "withdrawn", respondedAt: new Date() })
      .where(and(eq(claims.id, claim.id), eq(claims.status, "open")))
      .returning();
    if (!w) throw new ClaimError("This request was already answered.");
    await tx.update(deals).set({ status: next }).where(eq(deals.id, deal.id));
    await recordEvent(tx, deal.id, "buyer", "adjustment_withdrawn", "Buyer withdrew the adjustment request");
  });
}

/** E6: exporter answers the open request. The adjusted payment becomes the amount due. */
export async function respondToClaim(exporterId: string, dealId: string, input: { decision: string; counterMajor: number; note: string }) {
  const deal = await db.query.deals.findFirst({ where: and(eq(deals.id, dealId), eq(deals.exporterId, exporterId)) });
  if (!deal) throw new ClaimError("Deal not found");
  const claim = await db.query.claims.findFirst({ where: and(eq(claims.dealId, dealId), eq(claims.status, "open")) });
  if (!claim || deal.status !== "claim_open") throw new ClaimError("There's no open request on this deal.");

  const decision = input.decision as Decision;
  if (!["accept", "counter", "reject"].includes(decision)) throw new ClaimError("Choose a response.");
  const note = input.note.trim().slice(0, 1000);
  const counter = Math.round(input.counterMajor * 100);
  if (decision === "counter" && (!Number.isFinite(counter) || counter <= 0 || counter >= claim.amountRequestedMinor)) {
    throw new ClaimError(`Offer an amount between ${fmt(1, deal.currency)} and ${fmt(claim.amountRequestedMinor - 1, deal.currency)}.`);
  }
  if (decision === "reject" && note.length < 5) throw new ClaimError("Add a short note for the buyer.");

  const agreed = agreedFor(decision, claim.amountRequestedMinor, counter);
  const after = amountsDue(deal, [{ status: "accepted", agreedAmountMinor: agreed, appliesTo: claim.appliesTo }]);
  const newAmount = claim.appliesTo === "final" ? after.final : after.balance;
  const what = claim.appliesTo === "final" ? "final payment" : "balance";
  const rate = kesRate(deal.currency);
  const cur = deal.currency;
  const summary =
    decision === "accept"
      ? `Exporter accepted the adjustment · ${fmt(agreed, cur)} off · new ${what} ${both(newAmount, cur, rate)}`
      : decision === "counter"
        ? `Exporter confirmed ${fmt(agreed, cur)} off instead of ${fmt(claim.amountRequestedMinor, cur)} · new ${what} ${both(newAmount, cur, rate)}`
        : `Exporter kept the ${what} at ${both(newAmount, cur, rate)}, pointing to the dispatch records`;

  // If the adjustment brings the payment to zero, skip it and move to what's next.
  let nextStatus: Deal["status"] = "balance_agreed";
  if (newAmount === 0) nextStatus = claim.appliesTo === "final" || after.final === 0 ? "balance_paid" : "final_due";

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(claims)
      .set({
        status: decision === "accept" ? "accepted" : decision === "counter" ? "countered" : "rejected",
        agreedAmountMinor: agreed,
        responseNote: note || null,
        respondedAt: new Date(),
      })
      .where(and(eq(claims.id, claim.id), eq(claims.status, "open")))
      .returning();
    if (!updated) throw new ClaimError("This request was already answered.");
    await tx.update(deals).set({ status: nextStatus }).where(eq(deals.id, dealId));
    await recordEvent(tx, dealId, "exporter", `adjustment_${updated.status}`, summary, note ? { note } : undefined);
    if (newAmount > 0) {
      await recordEvent(tx, dealId, "system", `${claim.appliesTo}_requested`, `${what[0].toUpperCase()}${what.slice(1)} requested from buyer · ${both(newAmount, cur, rate)}`);
    } else if (nextStatus === "final_due") {
      await recordEvent(tx, dealId, "system", "final_requested", `Final payment requested from buyer · ${both(after.final, cur, rate)}`);
    } else {
      await recordEvent(tx, dealId, "system", "paid_in_full", "Nothing further is due: the deal is paid in full");
    }
  });
}

/** Serve evidence file n of a request. Callers check access to the deal first. */
export async function claimPhotoResponse(deal: Pick<Deal, "id">, claimId: string, n: number) {
  const claim = await db.query.claims.findFirst({ where: and(eq(claims.id, claimId), eq(claims.dealId, deal.id)) });
  const key = claim?.evidence[n]?.key ?? claim?.photoKeys[n];
  if (!key) return new Response("Not found", { status: 404 });
  const bytes = await getObject(key);
  if (!bytes) return new Response("File missing", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentTypeForKey(key),
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
