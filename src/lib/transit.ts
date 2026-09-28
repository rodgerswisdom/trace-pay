// Transit temperature logs: parse a tracker's CSV export, summarise it against the agreed range,
// and generate the clearly labelled sample feed used in demos. Pure functions (client, server, scripts).

export type Point = [number, number]; // [epochMs, °C]

export class TrackerParseError extends Error {}

const TIME_COL = /^(timestamp|time|date[ _-]?time|datetime|date|recorded[ _-]?at|utc)/i;
const TEMP_COL = /(temp|°c|celsius|deg)/i;

function parseTime(raw: string): number | null {
  const v = raw.trim().replace(/^"|"$/g, "");
  if (!v) return null;
  if (/^\d{10,13}$/.test(v)) return v.length === 13 ? Number(v) : Number(v) * 1000;
  // "2026-09-27 14:30" / "2026-09-27T14:30:00Z" — no zone means UTC.
  const iso = v.includes("T") ? v : v.replace(" ", "T");
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const t = Date.parse(withZone);
  return Number.isNaN(t) ? null : t;
}

/** Parse a tracker CSV export: a time column and a °C column, any order; '#' lines are comments. */
export function parseTrackerCsv(text: string): { points: Point[]; device: string | null; isSample: boolean } {
  const lines = text.split(/\r?\n/);
  const comments = lines.filter((l) => l.trim().startsWith("#")).join("\n");
  const rows = lines.filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (rows.length < 3) throw new TrackerParseError("The file has too few rows to be a tracker export.");

  const sep = rows[0].includes(";") && !rows[0].includes(",") ? ";" : ",";
  const header = rows[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));
  const ti = header.findIndex((h) => TIME_COL.test(h));
  const ci = header.findIndex((h, i) => i !== ti && TEMP_COL.test(h));
  if (ti < 0 || ci < 0) throw new TrackerParseError("Expected a time column and a temperature (°C) column, e.g. timestamp,temperature_c.");

  const points: Point[] = [];
  for (const row of rows.slice(1, 50_001)) {
    const cells = row.split(sep);
    const t = parseTime(cells[ti] ?? "");
    const c = Number((cells[ci] ?? "").trim().replace(",", "."));
    if (t !== null && Number.isFinite(c) && c > -40 && c < 60) points.push([t, Math.round(c * 100) / 100]);
  }
  if (points.length < 3) throw new TrackerParseError("No readable time and temperature rows were found.");
  points.sort((a, b) => a[0] - b[0]);

  const device = /#\s*device\s*[:=]\s*(.+)/i.exec(comments)?.[1]?.trim().slice(0, 80) ?? null;
  const isSample = /\bSAMPLE\b/.test(comments);
  return { points, device, isSample };
}

export type TransitSummary = {
  count: number;
  minC: number;
  maxC: number;
  startAt: number;
  endAt: number;
  /** Minutes spent outside the agreed range (null when no range was agreed). */
  minutesOutside: number | null;
  /** Largest distance outside the range, in °C. */
  worstExcursionC: number | null;
};

/** Excursions shorter than this are treated as noise (door openings, handling). */
export const EXCURSION_TOLERANCE_MIN = 30;

export function summarize(points: Point[], range?: { min: number | null; max: number | null }): TransitSummary {
  let minC = Infinity;
  let maxC = -Infinity;
  for (const [, c] of points) {
    minC = Math.min(minC, c);
    maxC = Math.max(maxC, c);
  }
  let minutesOutside: number | null = null;
  let worst: number | null = null;
  if (range && range.min != null && range.max != null) {
    minutesOutside = 0;
    worst = 0;
    for (let i = 0; i < points.length; i++) {
      const [t, c] = points[i];
      const off = c < range.min ? range.min - c : c > range.max ? c - range.max : 0;
      if (off > 0) {
        // Each reading stands for the interval until the next one.
        const next = points[i + 1]?.[0] ?? t;
        minutesOutside += (next - t) / 60_000;
        worst = Math.max(worst, off);
      }
    }
    minutesOutside = Math.round(minutesOutside);
    worst = Math.round(worst * 10) / 10;
  }
  return {
    count: points.length,
    minC,
    maxC,
    startAt: points[0][0],
    endAt: points[points.length - 1][0],
    minutesOutside,
    worstExcursionC: worst,
  };
}

/** Keep the shape of a long log for drawing: at most `max` points, keeping each bucket's extremes. */
export function downsample(points: Point[], max = 400): Point[] {
  if (points.length <= max) return points;
  const bucket = Math.ceil(points.length / (max / 2));
  const out: Point[] = [];
  for (let i = 0; i < points.length; i += bucket) {
    const slice = points.slice(i, i + bucket);
    const lo = slice.reduce((a, b) => (b[1] < a[1] ? b : a));
    const hi = slice.reduce((a, b) => (b[1] > a[1] ? b : a));
    out.push(...(lo[0] <= hi[0] ? [lo, hi] : [hi, lo]));
  }
  return out;
}

/**
 * The demo's sample tracker feed: a clean reefer line around 5.6 °C, 15-minute readings,
 * clearly labelled as sample data in the file itself.
 */
export function sampleTrackerCsv(start: Date, hours = 52, label = "TP demo"): string {
  const lines = [
    "# SAMPLE tracker feed for TRACE Pay demos. Not data from a real shipment.",
    "# device: SAMPLE-LOGGER-01 (demo)",
    `# shipment: ${label}`,
    "timestamp,temperature_c",
  ];
  const step = 15 * 60_000;
  // Deterministic gentle wobble, so the chart looks like a real logger but is reproducible.
  for (let i = 0; i <= (hours * 60) / 15; i++) {
    const t = new Date(start.getTime() + i * step);
    const settle = i < 6 ? (6 - i) * 0.15 : 0; // cools down gently after loading, staying in range
    const c = 5.6 + settle + 0.25 * Math.sin(i / 5) + 0.12 * Math.sin(i / 1.7);
    lines.push(`${t.toISOString().slice(0, 16).replace("T", " ")},${c.toFixed(1)}`);
  }
  return lines.join("\n") + "\n";
}
