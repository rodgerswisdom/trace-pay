import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { deals, transitLogs, type Deal } from "@/db/schema";
import { recordEvent } from "./deals";
import { MAX_UPLOAD_BYTES } from "./proof";
import { getObject, putObject, safeName } from "./storage";
import { TrackerParseError, parseTrackerCsv, sampleTrackerCsv, summarize } from "./transit";

export class TransitError extends Error {}

/**
 * Attach the tracker export to a dispatched deal. Once per deal, never replaced (the database refuses
 * changes too). The fingerprint and time are ours; the readings are parsed server-side from the bytes.
 */
export async function attachTransitLog(exporterId: string, dealId: string, source: { file: File } | { sample: true }) {
  const deal = await db.query.deals.findFirst({ where: and(eq(deals.id, dealId), eq(deals.exporterId, exporterId)) });
  if (!deal) throw new TransitError("Deal not found");
  if (!deal.proofLockedAt || deal.status === "cancelled") throw new TransitError("Attach the transit log after proof of dispatch.");
  if (await db.query.transitLogs.findFirst({ where: eq(transitLogs.dealId, dealId) })) throw new TransitError("A transit log is already attached.");

  let text: string;
  let fileName: string;
  if ("sample" in source) {
    // Demo feed: a clean line over the last ~2 days, labelled SAMPLE inside the file.
    fileName = `SAMPLE-tracker-${deal.number}.csv`;
    text = sampleTrackerCsv(new Date(Date.now() - 52 * 3600_000), 52, deal.number);
  } else {
    const f = source.file;
    if (f.size === 0 || f.size > MAX_UPLOAD_BYTES) throw new TransitError("The file is empty or larger than 10 MB.");
    if (!/\.(csv|txt)$/i.test(f.name) && !/csv|text\/plain|ms-excel/.test(f.type)) throw new TransitError("Upload the tracker's CSV export.");
    fileName = f.name.slice(0, 200);
    text = await f.text();
  }

  let parsed;
  try {
    parsed = parseTrackerCsv(text);
  } catch (e) {
    if (e instanceof TrackerParseError) throw new TransitError(`We couldn't read this tracker export. ${e.message}`);
    throw e;
  }

  const bytes = new TextEncoder().encode(text);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const fileKey = `deals/${dealId}/transit/${crypto.randomUUID()}-${safeName(fileName)}`;
  const sum = summarize(parsed.points, { min: deal.tempMinC, max: deal.tempMaxC });
  await putObject(fileKey, bytes);

  await db.transaction(async (tx) => {
    await tx.insert(transitLogs).values({
      dealId,
      fileKey,
      fileName,
      sha256,
      device: parsed.device,
      points: parsed.points,
      count: sum.count,
      minC: sum.minC,
      maxC: sum.maxC,
      startAt: new Date(sum.startAt),
      endAt: new Date(sum.endAt),
      isSample: "sample" in source || parsed.isSample,
      receivedAt: new Date(),
    });
    await recordEvent(tx, dealId, "exporter", "transit_log_attached", transitSummaryText(deal, sum, "sample" in source || parsed.isSample));
  });
}

export function transitSummaryText(
  deal: Pick<Deal, "tempMinC" | "tempMaxC">,
  sum: ReturnType<typeof summarize>,
  isSample: boolean,
) {
  const range =
    deal.tempMinC != null && deal.tempMaxC != null
      ? sum.minutesOutside
        ? ` · ${sum.minutesOutside} min outside the agreed ${deal.tempMinC}–${deal.tempMaxC} °C`
        : ` · always inside the agreed ${deal.tempMinC}–${deal.tempMaxC} °C`
      : "";
  return `Transit log attached${isSample ? " (sample feed)" : ""} · ${sum.count} readings · ${sum.minC.toFixed(1)}–${sum.maxC.toFixed(1)} °C${range}`;
}

export async function transitFileResponse(dealId: string) {
  const log = await db.query.transitLogs.findFirst({ where: eq(transitLogs.dealId, dealId) });
  if (!log) return new Response("Not found", { status: 404 });
  const bytes = await getObject(log.fileKey);
  if (!bytes) return new Response("File missing", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${log.fileName.replace(/["\\\r\n]/g, "_")}"`,
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
