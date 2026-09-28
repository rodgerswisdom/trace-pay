import type { Claim } from "@/db/schema";
import type { ProofType } from "./proof";

// Shared claim rules (client and server).

export type ClaimReason = Claim["reason"];

/** Proof most relevant to each kind of claim, most relevant first (E6 shows these first). */
export const RELEVANT_PROOF: Record<ClaimReason, ProofType[]> = {
  immature: ["dry_matter", "inspection_report"],
  overripe_damaged: ["temperature_log", "loading_photo", "inspection_report"],
  underweight: ["airway_bill", "loading_photo", "inspection_report"],
  other: ["inspection_report", "loading_photo", "dry_matter", "temperature_log", "airway_bill", "phyto"],
};

export const MAX_CLAIM_PHOTOS = 8;
export const CLAIM_PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const contentTypeForKey = (key: string) =>
  Object.entries(CLAIM_PHOTO_TYPES).find(([, ext]) => key.toLowerCase().endsWith(`.${ext}`))?.[0] ?? "application/octet-stream";

export type Decision = "accept" | "counter" | "reject";

/** The reduction a response agrees to, in minor units. */
export function agreedFor(decision: Decision, requestedMinor: number, counterMinor: number) {
  return decision === "accept" ? requestedMinor : decision === "counter" ? counterMinor : 0;
}
