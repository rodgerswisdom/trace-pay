"use client";

import { useEffect, useState } from "react";
import { ClockIcon } from "lucide-react";
import { timeLeftLabel } from "@/lib/terms";
import { cn } from "@/lib/utils";

/** "31 hrs left" — counts down in the browser; the server render shows the same text from its clock. */
export function DeadlineChip({ endsAt, className }: { endsAt: string; className?: string }) {
  const end = new Date(endsAt);
  const [label, setLabel] = useState(() => timeLeftLabel(end));
  useEffect(() => {
    const id = setInterval(() => setLabel(timeLeftLabel(new Date(endsAt))), 30_000);
    return () => clearInterval(id);
  }, [endsAt]);
  return (
    <span
      className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border bg-background px-3 text-xs font-medium whitespace-nowrap", className)}
      suppressHydrationWarning
    >
      <ClockIcon aria-hidden className="size-3.5 text-muted-foreground" />
      <span className="sr-only">Time left to request an adjustment:</span>
      {label}
    </span>
  );
}
