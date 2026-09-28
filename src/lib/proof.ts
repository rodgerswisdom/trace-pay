import type { ProofItem } from "@/db/schema";

// The proof-of-dispatch checklist (E5). Shared by the upload screen, the server checks and the galleries.

export type ProofType = ProofItem["type"];

export type ProofSpec = {
  type: ProofType;
  required: boolean;
  /** Minimum number of files when required. */
  min: number;
  multiple: boolean;
  source: "independent" | "exporter";
  accept: string;
  /** A reading entered alongside the file. */
  reading?: { unit: string; required: boolean; min: number; max: number; step: string };
  /** Who issued it (independent reports). */
  issuer?: boolean;
  /** Also record a structured reading (value, sample size, device) as the origin reading. */
  structured?: boolean;
};

const PHOTO = "image/jpeg,image/png,image/webp";
const PHOTO_OR_PDF = `${PHOTO},application/pdf`;

export const PROOF_SPECS: ProofSpec[] = [
  { type: "dry_matter", required: true, min: 1, multiple: false, source: "exporter", accept: PHOTO_OR_PDF, reading: { unit: "%", required: true, min: 10, max: 45, step: "0.1" }, structured: true },
  { type: "phyto", required: true, min: 1, multiple: false, source: "exporter", accept: PHOTO_OR_PDF },
  { type: "loading_photo", required: true, min: 2, multiple: true, source: "exporter", accept: PHOTO },
  { type: "airway_bill", required: true, min: 1, multiple: false, source: "exporter", accept: PHOTO_OR_PDF },
  { type: "inspection_report", required: false, min: 1, multiple: false, source: "independent", accept: PHOTO_OR_PDF, issuer: true },
  { type: "temperature_log", required: false, min: 1, multiple: false, source: "exporter", accept: `${PHOTO_OR_PDF},text/csv`, reading: { unit: "°C", required: false, min: -5, max: 30, step: "0.1" } },
];

export const specFor = (type: string) => PROOF_SPECS.find((s) => s.type === type);

/** Content types the server accepts from uploads. Never SVG or HTML from users. */
export const UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/csv"]);
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Items still missing before proof can be attached. Only fingerprinted items count. */
export function missingRequired(items: Pick<ProofItem, "type" | "sha256">[]) {
  return PROOF_SPECS.filter((s) => s.required && items.filter((i) => i.type === s.type && i.sha256).length < s.min).map((s) => s.type);
}

export const isImage = (contentType: string) => contentType.startsWith("image/");
