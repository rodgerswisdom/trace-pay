"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Point } from "@/lib/transit";

// Transit temperature against the agreed range. One series, so no legend box: the section title
// names it. 2px line, the agreed range as a quiet reference band, hairline grid, crosshair tooltip,
// keyboard stepping, and a table view. Readings outside the range are marked with a label, not colour alone.

const H = 220;
const PAD = { top: 16, right: 56, bottom: 28, left: 40 };

function fmtTime(ms: number, timeZone?: string) {
  const d = new Date(ms);
  const day = d.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
  return `${time}, ${day}`;
}

export function TransitChart({
  points,
  min,
  max,
  timeZone,
  label = "Transit temperature",
}: {
  points: Point[];
  min: number | null;
  max: number | null;
  /** IANA zone; undefined = the viewer's own. */
  timeZone?: string;
  label?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const t0 = points[0][0];
    const t1 = points[points.length - 1][0];
    const values = points.map((p) => p[1]);
    const lo = Math.floor(Math.min(...values, min ?? Infinity) - 1);
    const hi = Math.ceil(Math.max(...values, max ?? -Infinity) + 1);
    const pw = width - PAD.left - PAD.right;
    const ph = H - PAD.top - PAD.bottom;
    const x = (t: number) => PAD.left + ((t - t0) / Math.max(1, t1 - t0)) * pw;
    const y = (c: number) => PAD.top + (1 - (c - lo) / Math.max(0.1, hi - lo)) * ph;
    const path = points.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
    const step = hi - lo > 12 ? 4 : hi - lo > 6 ? 2 : 1;
    const yTicks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yTicks.push(v);
    const xTicks = [t0, t0 + (t1 - t0) / 2, t1];
    const outside = min != null && max != null ? points.map((p, i) => (p[1] < min || p[1] > max ? i : -1)).filter((i) => i >= 0) : [];
    return { x, y, path, yTicks, xTicks, outside, pw, ph };
  }, [points, width, min, max]);

  const nearest = (clientX: number) => {
    const rect = wrap.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(geo.x(points[i][0]) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  const last = points[points.length - 1];
  const h = hover != null ? points[hover] : null;
  const summary = `${label}: ${points.length} readings from ${fmtTime(points[0][0], timeZone)} to ${fmtTime(last[0], timeZone)}${
    min != null && max != null ? `; agreed range ${min}–${max} °C; ${geo.outside.length ? `${geo.outside.length} readings outside` : "all readings inside"}` : ""
  }.`;

  return (
    <figure className="flex flex-col gap-2">
      <div
        ref={wrap}
        className="relative touch-pan-y overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        tabIndex={0}
        role="img"
        aria-label={summary}
        onPointerMove={(e) => setHover(nearest(e.clientX))}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setHover((i) => Math.min(points.length - 1, (i ?? -1) + 1));
          else if (e.key === "ArrowLeft") setHover((i) => Math.max(0, (i ?? points.length) - 1));
          else if (e.key === "Escape") setHover(null);
          else return;
          e.preventDefault();
        }}
        onBlur={() => setHover(null)}
      >
        <svg width={width} height={H} className="block text-muted-foreground" aria-hidden>
          {/* Agreed range: a reference band, not data */}
          {min != null && max != null && (
            <g>
              <rect x={PAD.left} y={geo.y(max)} width={geo.pw} height={Math.max(0, geo.y(min) - geo.y(max))} className="fill-primary/10" />
              <text x={PAD.left + 6} y={geo.y(max) + 13} className="fill-muted-foreground text-[11px]">
                Agreed {min}–{max} °C
              </text>
            </g>
          )}
          {/* Hairline grid and y labels */}
          {geo.yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={PAD.left + geo.pw} y1={geo.y(v)} y2={geo.y(v)} className="stroke-border" strokeWidth={1} />
              <text x={PAD.left - 6} y={geo.y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                {v}°
              </text>
            </g>
          ))}
          {geo.xTicks.map((t, i) => (
            <text
              key={t}
              x={geo.x(t)}
              y={H - 8}
              textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
              className="fill-muted-foreground text-[11px]"
            >
              {fmtTime(t, timeZone)}
            </text>
          ))}
          {/* The series */}
          <path d={geo.path} fill="none" stroke="var(--chart-series)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {/* Out-of-range readings: marked, with a surface ring so they read over the line */}
          {geo.outside.map((i) => (
            <circle key={i} cx={geo.x(points[i][0])} cy={geo.y(points[i][1])} r={4} fill="var(--chart-warning)" className="stroke-background" strokeWidth={2} />
          ))}
          {/* Status is never colour alone: icon + label at the first excursion */}
          {geo.outside.length > 0 && (
            <g transform={`translate(${Math.min(geo.x(points[geo.outside[0]][0]), width - PAD.right - 110)}, ${PAD.top + 2})`}>
              <path d="M6 0 L12 11 L0 11 Z" fill="var(--chart-warning)" className="stroke-foreground/60" strokeWidth={0.75} />
              <text x={16} y={10} className="fill-foreground text-[11px] font-medium">
                Outside range
              </text>
            </g>
          )}
          {/* Value at the line end */}
          <text x={geo.x(last[0]) + 6} y={geo.y(last[1]) + 4} className="fill-foreground text-[11px] font-medium tabular-nums">
            {last[1].toFixed(1)} °C
          </text>
          {/* Crosshair */}
          {h && (
            <g>
              <line x1={geo.x(h[0])} x2={geo.x(h[0])} y1={PAD.top} y2={PAD.top + geo.ph} className="stroke-foreground/40" strokeWidth={1} />
              <circle cx={geo.x(h[0])} cy={geo.y(h[1])} r={4} fill="var(--chart-series)" className="stroke-background" strokeWidth={2} />
            </g>
          )}
        </svg>
        {h && (
          <div
            className="pointer-events-none absolute top-1 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: Math.min(Math.max(0, geo.x(h[0]) - 70), width - 150) }}
          >
            <p className="font-semibold tabular-nums">
              {h[1].toFixed(1)} °C
              {min != null && max != null && (h[1] < min || h[1] > max) && <span className="ml-1 font-medium text-muted-foreground">· ⚠ outside range</span>}
            </p>
            <p className="text-muted-foreground">{fmtTime(h[0], timeZone)}</p>
          </div>
        )}
      </div>
      <figcaption className="text-xs text-muted-foreground">{summary}</figcaption>
      <details className="text-xs">
        <summary className="flex h-8 w-fit cursor-pointer items-center text-muted-foreground">Show readings as a table</summary>
        <div className="max-h-56 overflow-y-auto rounded-md border">
          <table className="w-full text-left tabular-nums">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="px-2 py-1 font-medium">Time</th>
                <th className="px-2 py-1 text-right font-medium">°C</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p[0]} className="border-t">
                  <td className="px-2 py-1">{fmtTime(p[0], timeZone)}</td>
                  <td className="px-2 py-1 text-right">
                    {p[1].toFixed(1)}
                    {min != null && max != null && (p[1] < min || p[1] > max) ? " (outside)" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
