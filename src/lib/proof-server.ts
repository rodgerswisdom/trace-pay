import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { deals, proofItems, readings } from "@/db/schema";
import { MAX_UPLOAD_BYTES, UPLOAD_TYPES, specFor } from "./proof";
import { deleteObject, getObject, putObject, safeName } from "./storage";

export class ProofError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** The signed-in exporter's deal, open for proof (deposit paid, not locked). */
export async function openDealForProof(dealId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new ProofError("Sign in again", 401);
  const deal = await db.query.deals.findFirst({ where: and(eq(deals.id, dealId), eq(deals.exporterId, session.user.id)) });
  if (!deal) throw new ProofError("Deal not found", 404);
  if (deal.proofLockedAt) throw new ProofError("Proof is already attached and can't be changed", 409);
  if (deal.status !== "deposit_paid") throw new ProofError("Proof can be added once the deposit is paid", 409);
  return deal;
}

/**
 * Store one proof file. The fingerprint is computed here from the bytes we received, and the
 * timestamp is our server time — never values sent by the client.
 */
export async function addProofItem(dealId: string, form: FormData) {
  await openDealForProof(dealId);

  const type = String(form.get("type") ?? "");
  const spec = specFor(type);
  if (!spec) throw new ProofError("Unknown proof type");

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ProofError("No file received");
  if (file.size > MAX_UPLOAD_BYTES) throw new ProofError("File is larger than 10 MB");
  const contentType = file.type || "application/octet-stream";
  if (!UPLOAD_TYPES.has(contentType) || !spec.accept.split(",").includes(contentType)) {
    throw new ProofError("This file type isn't accepted here");
  }

  let value: string | null = null;
  if (spec.reading) {
    const raw = String(form.get("value") ?? "").trim();
    if (raw) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < spec.reading.min || n > spec.reading.max) throw new ProofError("Check the reading");
      value = String(n);
    } else if (spec.reading.required) {
      throw new ProofError("Enter the reading");
    }
  }
  const issuer = spec.issuer ? String(form.get("issuer") ?? "").trim().slice(0, 120) || null : null;
  if (spec.issuer && !issuer) throw new ProofError("Enter the inspection company");

  let structured: { sampleSize: number; device: string } | null = null;
  if (spec.structured) {
    const sampleSize = Number(form.get("sampleSize"));
    const device = String(form.get("device") ?? "").trim().slice(0, 80);
    if (!Number.isInteger(sampleSize) || sampleSize < 1 || sampleSize > 500) throw new ProofError("Enter the sample size (number of fruit)");
    if (device.length < 2) throw new ProofError("Enter the device or method used");
    structured = { sampleSize, device };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const id = crypto.randomUUID();
  const fileKey = `deals/${dealId}/${id}-${safeName(file.name)}`;

  await putObject(fileKey, bytes);
  try {
    return await db.transaction(async (tx) => {
      const [item] = await tx
        .insert(proofItems)
        .values({
          id,
          dealId,
          type: spec.type,
          source: spec.source,
          issuer,
          value,
          fileKey,
          fileName: file.name.slice(0, 200),
          contentType,
          sizeBytes: bytes.byteLength,
          sha256,
          receivedAt: new Date(),
        })
        .returning();
      // The packhouse reading as data, not just a photo of the sheet.
      if (structured && value) {
        await tx.insert(readings).values({
          dealId,
          stage: "origin",
          recordedBy: "exporter",
          dryMatterPct: Number(value),
          sampleSize: structured.sampleSize,
          device: structured.device,
          proofItemId: item.id,
          recordedAt: item.receivedAt!,
        });
      }
      return item;
    });
  } catch (e) {
    await deleteObject(fileKey); // e.g. proof got locked between the check and the insert
    throw e;
  }
}

/** Remove a mistaken upload. Only before proof is locked (the database refuses it afterwards too). */
export async function removeProofItem(dealId: string, itemId: string) {
  await openDealForProof(dealId);
  const item = await db.transaction(async (tx) => {
    await tx.delete(readings).where(and(eq(readings.dealId, dealId), eq(readings.proofItemId, itemId)));
    const [removed] = await tx
      .delete(proofItems)
      .where(and(eq(proofItems.id, itemId), eq(proofItems.dealId, dealId)))
      .returning();
    return removed;
  });
  if (!item) throw new ProofError("Not found", 404);
  await deleteObject(item.fileKey);
}

export function proofErrorResponse(e: unknown) {
  if (e instanceof ProofError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
}

/** Serve a stored proof file. Callers must have checked access to the deal first. */
export async function proofFileResponse(dealId: string, itemId: string, download: boolean) {
  const item = await db.query.proofItems.findFirst({ where: and(eq(proofItems.id, itemId), eq(proofItems.dealId, dealId)) });
  if (!item) return new Response("Not found", { status: 404 });
  const bytes = await getObject(item.fileKey);
  if (!bytes) return new Response("File missing", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": item.contentType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${item.fileName.replace(/["\\\r\n]/g, "_")}"`,
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
      // Files are data, never a page: no scripts, even if opened directly.
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
