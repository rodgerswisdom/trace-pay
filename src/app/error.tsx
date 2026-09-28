"use client";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main role="alert" className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16">
      <Logo height={22} />
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">If you were paying, check the deal page before trying again — payments are only marked paid once Payaza confirms them.</p>
      <Button className="h-12 w-fit px-6 text-base" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
