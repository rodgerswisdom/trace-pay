import { cn } from "@/lib/utils";

/**
 * A screen's single primary action. On phones it's pinned to the bottom, full width, within thumb reach.
 * From md up it sits inline where it's placed (e.g. in a side panel), or is hidden when the page
 * already shows the action elsewhere on desktop (desktop="hidden").
 */
export function BottomBar({
  children,
  className,
  desktop = "inline",
}: {
  children: React.ReactNode;
  className?: string;
  desktop?: "inline" | "hidden";
}) {
  return (
    <>
      <div aria-hidden className="h-28 md:hidden" />
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur",
          desktop === "hidden"
            ? "md:hidden"
            : "md:static md:z-auto md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none",
        )}
      >
        <div className={cn("flex flex-col gap-2", className)}>{children}</div>
      </div>
    </>
  );
}

export const primaryButton = "h-12 w-full text-base";
