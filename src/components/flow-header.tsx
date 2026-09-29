import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Back, title, "Step n of m · name" and a progress bar, for the exporter's short guided flows. */
export function FlowHeader({
  title,
  steps,
  step,
  backHref,
  onBack,
}: {
  title: string;
  steps: readonly string[];
  /** -1 hides the step line (e.g. a done screen). */
  step: number;
  backHref: string;
  onBack?: () => void;
}) {
  const back = "-ml-2 inline-flex size-12 shrink-0 items-center justify-center rounded-lg hover:bg-muted";
  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {onBack ? (
          <button type="button" onClick={onBack} className={back} aria-label="Back">
            <ArrowLeftIcon className="size-5" />
          </button>
        ) : (
          <Link href={backHref} className={back} aria-label="Back">
            <ArrowLeftIcon className="size-5" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold md:text-xl">{title}</h1>
          {step >= 0 && (
            <p className="text-sm text-muted-foreground">
              Step {step + 1} of {steps.length} · {steps[step]}
            </p>
          )}
        </div>
      </div>
      {step >= 0 && (
        <div className="flex gap-1" aria-hidden>
          {steps.map((_, i) => (
            <span key={i} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
      )}
    </header>
  );
}
