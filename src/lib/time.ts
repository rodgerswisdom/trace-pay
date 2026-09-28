// Shared by server and client components. Exporter side shows East Africa Time.
const EAT = "Africa/Nairobi";

/** "28 Sep" (en-GB would give "Sept"). */
export function fmtDateEAT(d: Date) {
  const day = d.toLocaleDateString("en-US", { day: "numeric", timeZone: EAT });
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: EAT });
  return `${day} ${month}`;
}

/** "14:32, 28 Sep" in East Africa Time. */
export function fmtTimeEAT(d: Date) {
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: EAT });
  return `${time}, ${fmtDateEAT(d)}`;
}
