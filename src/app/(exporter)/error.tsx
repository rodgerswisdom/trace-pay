"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ExporterError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="flex max-w-md flex-col gap-4 py-10">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        Nothing was lost. If you were uploading or paying, check the deal before trying again. Imeshindikana — jaribu tena.
      </p>
      <div className="flex gap-2">
        <Button className="h-12 px-6 text-base" onClick={reset}>
          Try again
        </Button>
        <Link href="/home" className={cn(buttonVariants({ variant: "outline" }), "h-12 px-6 text-base")}>
          Home
        </Link>
      </div>
    </div>
  );
}
