import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { CLAIM_REASONS, claims, deals, payments, readings, transitLogs, type Deal } from "@/db/schema";
import { VERDICT_LABEL, claimCheckFor } from "./claim-check";
import { CLAIM_PHOTO_TYPES, MAX_CLAIM_PHOTOS, agreedFor, contentTypeForKey, type Decision } from "./claims";
import { amountsDue, recordEvent } from "./deals";
import { both, fmt, kesRate } from "./money";
import { MAX_UPLOAD_BYTES } from "./proof";
import { getObject, putObject, safeName } from "./storage";

const REASON_TEXT: Record<(typeof CLAIM_REASONS)[number], string> = {
  underweight: "underweight",
  immature: "immature",
  overripe_damaged: "overripe or damaged",
  other: "other",
};

export class ClaimError extends Error {}

/** Arrival can be confirmed once the fruit is dispatched (proof locked), once. */
async function dealOpenForArrival(token: string) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.buyerToken, token) });
  if (!deal) throw new ClaimError("Deal not found");
  if (!deal.proofLockedAt || !["proof_attached", "awaiting_arrival"].includes(deal.status)) {
    throw new ClaimError("Arrival can be confirmed after proof of dispatch, while a payment is still due.");
  }
  if (deal.arrivedAt) throw new ClaimError("Arrival has already been confirmed on this deal.");
  return deal;
}

const photoPrefix = (dealId: string) => `deals/${dealId}/claims/`;

/** Buyer uploads one claim photo before sending the arrival report. Returns the storage key. */
export async function uploadClaimPhoto(token: string, file: File) {
  const deal = await dealOpenForArrival(token);
  const ext = CLAIM_PHOTO_TYPES[file.type];
  if (!ext) throw new ClaimError("Photos must be JPEG, PNG or WebP.");
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) throw new ClaimError("Photo is empty or larger than 4 MB.");
  const base = safeName(file.name).replace(/\.[^.]+$/, "");
  const key = `${photoPrefix(deal.id)}${crypto.randomUUID()}-${base}.${ext}`;
  await putObject(key, new Uint8Array(await file.arrayBuffer()));
  return key;
}

type ArrivalInput = {
  dryMatterPct: number;
  sampleSize: number;
  device: string;
  pulpTempC: number | null;
  notes: string;
  issue: null | { reason: string; description: string; amountMajor: number; photoKeys: string[] };
};

/**
 * The buyer's arrival report: a reading that matches the packhouse one, and optionally a quality issue.
 * Without an issue, confirming arrival requests the final tranche (once the balance is paid).
 * With one, the claim holds the next unpaid tranche and the claim check is recorded on the timeline.
 */
export async function confirmArrival(token: string, input: ArrivalInput) {
  const deal = await dealOpenForArrival(token);

  if (!Number.isFinite(input.dryMatterPct) || input.dryMatterPct < 10 || input.dryMatterPct > 45) throw new ClaimError("Enter the dry-matter reading (%).");
  if (!Number.isInteger(input.sampleSize) || input.sampleSize < 1 || input.sampleSize > 500) throw new ClaimError("Enter the sample size (number of fruit).");
  const device = input.device.trim().slice(0, 80);
  if (device.length < 2) throw new ClaimError("Enter the device or method used.");
  if (input.pulpTempC != null && (!Number.isFinite(input.pulpTempC) || input.pulpTempC < -5 || input.pulpTempC > 40)) throw new ClaimError("Check the pulp temperature.");

  const paid = await db.query.payments.findMany({ where: and(eq(payments.dealId, deal.id), inArray(payments.status, ["paid", "settled"])) });
  const balancePaid = paid.some((p) => p.kind === "balance");
  const due = amountsDue(deal);

  // Validate the issue before writing anything.
  let claim: null | { reason: (typeof CLAIM_REASONS)[number]; description: string; amount: number; photoKeys: string[]; appliesTo: "balance" | "final" } = null;
  if (input.issue) {
    const i = input.issue;
    if (!(CLAIM_REASONS as readonly string[]).includes(i.reason)) throw new ClaimError("Pick what's wrong.");
    const description = i.description.trim().slice(0, 2000);
    if (description.length < 5) throw new ClaimError("Describe the issue in a few words.");
    const appliesTo = balancePaid ? "final" : "balance";
    const tranche = appliesTo === "final" ? due.final : due.balance;
    if (tranche <= 0) throw new ClaimError("There's no unpaid amount left to hold on this deal. Contact the exporter directly.");
    const amount = Math.round(i.amountMajor * 100);
    if (!Number.isFinite(amount) || amount <= 0) throw new ClaimError("Enter the amount you want taken off.");
    if (amount >= tranche) {
      throw new ClaimError(`The amount must be less than the ${appliesTo === "final" ? "final payment" : "balance"} of ${fmt(tranche, deal.currency)}.`);
    }
    const photoKeys = [...new Set(i.photoKeys)].slice(0, MAX_CLAIM_PHOTOS);
    for (const key of photoKeys) {
      if (!key.startsWith(photoPrefix(deal.id)) || key.includes("..") || !(await getObject(key))) throw new ClaimError("A photo didn't upload. Remove it and try again.");
    }
    claim = { reason: i.reason as (typeof CLAIM_REASONS)[number], description, amount, photoKeys, appliesTo };
  }

  const now = new Date();
  const rate = kesRate(deal.currency);
  await db.transaction(async (tx) => {
    const [arrived] = await tx
      .update(deals)
      .set({ arrivedAt: now })
      .where(and(eq(deals.id, deal.id), eq(deals.status, deal.status)))
      .returning();
    if (!arrived) throw new ClaimError("This deal changed while you were filling in the form. Reload and try again.");
    await tx.insert(readings).values({
      dealId: deal.id,
      stage: "arrival",
      recordedBy: "buyer",
      dryMatterPct: Math.round(input.dryMatterPct * 10) / 10,
      sampleSize: input.sampleSize,
      device,
      pulpTempC: input.pulpTempC,
      notes: input.notes.trim().slice(0, 500) || null,
      recordedAt: now,
    });
    await recordEvent(
      tx,
      deal.id,
      "buyer",
      "arrival_confirmed",
      `Buyer confirmed arrival · dry matter ${input.dryMatterPct.toFixed(1)}% (n=${input.sampleSize}, ${device})${input.pulpTempC != null ? ` · pulp ${input.pulpTempC.toFixed(1)} °C` : ""}`,
    );

    if (claim) {
      await tx.update(deals).set({ status: "claim_open" }).where(eq(deals.id, deal.id));
      await tx.insert(claims).values({
        dealId: deal.id,
        reason: claim.reason,
        description: claim.description,
        photoKeys: claim.photoKeys,
        amountRequestedMinor: claim.amount,
        appliesTo: claim.appliesTo,
      });
      await recordEvent(
        tx,
        deal.id,
        "buyer",
        "claim_opened",
        `Buyer reported a quality issue: ${REASON_TEXT[claim.reason]} · asks ${both(claim.amount, deal.currency, rate)} off${
          claim.photoKeys.length ? ` · ${claim.photoKeys.length} photo${claim.photoKeys.length > 1 ? "s" : ""}` : ""
        }`,
      );
      await recordEvent(tx, deal.id, "system", "on_hold", `${claim.appliesTo === "final" ? "Final payment" : "Balance"} on hold until the claim is answered`);

      // The claim check, from the locked origin data, the arrival reading and the transit log.
      const dealReadings = await tx.select().from(readings).where(eq(readings.dealId, deal.id));
      const [log] = await tx.select().from(transitLogs).where(eq(transitLogs.dealId, deal.id));
      const check = claimCheckFor({ deal, claim, readings: dealReadings, transitLog: log ?? null });
      await recordEvent(tx, deal.id, "system", "claim_check", `Claim check: ${VERDICT_LABEL[check.verdict]}. ${check.reason}`, {
        verdict: check.verdict,
        lines: check.lines,
      });
    } else if (deal.status === "awaiting_arrival" && due.final > 0) {
      await tx.update(deals).set({ status: "final_due" }).where(eq(deals.id, deal.id));
      await recordEvent(tx, deal.id, "system", "final_requested", `Final payment requested from buyer · ${both(due.final, deal.currency, rate)}`);
    }
  });
  return { claimed: !!claim };
}

/** E6: exporter answers the open claim. The adjusted tranche becomes the amount due. */
export async function respondToClaim(exporterId: string, dealId: string, input: { decision: string; counterMajor: number; note: string }) {
  const deal = await db.query.deals.findFirst({ where: and(eq(deals.id, dealId), eq(deals.exporterId, exporterId)) });
  if (!deal) throw new ClaimError("Deal not found");
  const claim = await db.query.claims.findFirst({ where: and(eq(claims.dealId, dealId), eq(claims.status, "open")) });
  if (!claim || deal.status !== "claim_open") throw new ClaimError("There's no open claim on this deal.");

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
      ? `Exporter accepted the claim · ${fmt(agreed, cur)} off · new ${what} ${both(newAmount, cur, rate)}`
      : decision === "counter"
        ? `Exporter offered ${fmt(agreed, cur)} off instead of ${fmt(claim.amountRequestedMinor, cur)} · new ${what} ${both(newAmount, cur, rate)}`
        : `Exporter rejected the claim with proof · ${what} stays ${both(newAmount, cur, rate)}`;

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
    if (!updated) throw new ClaimError("This claim was already answered.");
    await tx.update(deals).set({ status: "balance_agreed" }).where(eq(deals.id, dealId));
    await recordEvent(tx, dealId, "exporter", `claim_${updated.status}`, summary, note ? { note } : undefined);
    await recordEvent(tx, dealId, "system", `${claim.appliesTo}_requested`, `${what[0].toUpperCase()}${what.slice(1)} requested from buyer · ${both(newAmount, cur, rate)}`);
  });
}

/** Serve claim photo n of a claim. Callers check access to the deal first. */
export async function claimPhotoResponse(deal: Pick<Deal, "id">, claimId: string, n: number) {
  const claim = await db.query.claims.findFirst({ where: and(eq(claims.id, claimId), eq(claims.dealId, deal.id)) });
  const key = claim?.photoKeys[n];
  if (!key) return new Response("Not found", { status: 404 });
  const bytes = await getObject(key);
  if (!bytes) return new Response("File missing", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentTypeForKey(key),
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
