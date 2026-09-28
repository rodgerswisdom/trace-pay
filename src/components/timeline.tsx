import type { DealEvent } from "@/db/schema";
import { fmtTimeEAT } from "@/lib/time";

/** Exporter-side timeline, times in East Africa Time. Actor labels come from the exporter's language. */
export function Timeline({ events, actors }: { events: DealEvent[]; actors: Record<DealEvent["actor"], string> }) {
  return (
    <ol className="relative flex flex-col gap-4 border-l pl-5">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span aria-hidden className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-background bg-primary" />
          <p className="text-sm">{e.summary}</p>
          <p className="text-xs text-muted-foreground">
            {actors[e.actor]} · {fmtTimeEAT(e.createdAt)}
          </p>
        </li>
      ))}
    </ol>
  );
}
