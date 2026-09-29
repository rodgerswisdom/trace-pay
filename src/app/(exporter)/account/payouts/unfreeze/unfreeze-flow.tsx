"use client";

import { useRouter } from "next/navigation";
import { FlowHeader } from "@/components/flow-header";
import { SecureConfirm } from "../secure-confirm";

export function UnfreezeFlow() {
  const router = useRouter();
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <FlowHeader title="Unfreeze withdrawals" steps={[]} step={-1} backHref="/account#payouts" />
      <p className="text-muted-foreground">
        Check the accounts under &ldquo;Where you get paid&rdquo; are all yours first. Remove any you don&apos;t recognise.
      </p>
      <SecureConfirm change={{ op: "unfreeze" }} confirmLabel="Unfreeze withdrawals" onDone={() => router.push("/account#payouts")} />
    </div>
  );
}
