"use client";

import { useState } from "react";
import Link from "next/link";
import { acceptDeliveryAction, withdrawAction } from "@/app/b/[token]/adjust/actions";
import { SubmitButton } from "@/components/submit-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** The arrival choice: two equal buttons, neither pushed. Accepting asks once, plainly. */
export function ArrivalChoice({ token, canAdjust, finalNote }: { token: string; canAdjust: boolean; finalNote: string | null }) {
  const [open, setOpen] = useState(false);
  const equal = cn(buttonVariants({ variant: "outline" }), "h-12 w-full text-base font-medium");
  return (
    <>
      <div className={cn("grid gap-2", canAdjust && "grid-cols-2")}>
        <button type="button" className={equal} onClick={() => setOpen(true)}>
          Accept delivery
        </button>
        {canAdjust && (
          <Link href={`/b/${token}/adjust`} className={equal}>
            Request an adjustment
          </Link>
        )}
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="mx-auto max-w-lg gap-3 rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <SheetTitle className="text-lg font-semibold">Accept this delivery?</SheetTitle>
          <SheetDescription className="text-base">
            {finalNote ? `${finalNote} ` : ""}After accepting, an adjustment can&apos;t be requested for this delivery.
          </SheetDescription>
          <form action={acceptDeliveryAction.bind(null, token)} className="mt-1 flex flex-col gap-2">
            <SubmitButton>Accept delivery</SubmitButton>
            <Button type="button" variant="ghost" className="h-12 text-base" onClick={() => setOpen(false)}>
              Not yet
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Low-key but visible: withdraw an open adjustment request. */
export function WithdrawLink({ token, amountLabel }: { token: string; amountLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="h-11 w-fit text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
        Withdraw request
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="mx-auto max-w-lg gap-3 rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <SheetTitle className="text-lg font-semibold">Withdraw the adjustment request?</SheetTitle>
          <SheetDescription className="text-base">The full {amountLabel} will be due again, and the delivery counts as accepted.</SheetDescription>
          <form action={withdrawAction.bind(null, token)} className="mt-1 flex flex-col gap-2">
            <SubmitButton>Withdraw request</SubmitButton>
            <Button type="button" variant="ghost" className="h-12 text-base" onClick={() => setOpen(false)}>
              Keep the request
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
