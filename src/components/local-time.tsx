"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** "14:32, 28 Sep" in the viewer's own time zone (buyer side). Falls back to UTC on the server render. */
export function LocalTime({ iso }: { iso: string }) {
  const d = new Date(iso);
  const tz = useSyncExternalStore(noop, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => "UTC");
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const day = d.toLocaleDateString("en-US", { day: "numeric", timeZone: tz });
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: tz });
  return (
    <time dateTime={iso}>
      {time}, {day} {month}
      {tz === "UTC" ? " UTC" : ""}
    </time>
  );
}
