import type { DealStatus } from "@/db/schema";
import { cn } from "@/lib/utils";

// Colour supports the word; the word always carries the meaning.
const TONE: Record<DealStatus, string> = {
  awaiting_deposit: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  deposit_paid: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  proof_attached: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  claim_open: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  balance_agreed: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  awaiting_arrival: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  final_due: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  balance_paid: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  settled: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  cancelled: "bg-muted text-muted-foreground",
};

export function StatusChip({ status, label, className }: { status: DealStatus; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", TONE[status], className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
