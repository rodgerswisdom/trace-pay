"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon } from "lucide-react";
import { primaryButton } from "@/components/bottom-bar";
import { FlowHeader } from "@/components/flow-header";
import { AccountSummary } from "@/components/getting-paid";
import { Button } from "@/components/ui/button";
import { EXPECTED_TIME, type AccountView } from "@/lib/getting-paid";
import { freezeWithdrawals } from "../../../getting-paid-actions";
import { FreezeNotice, SecureConfirm } from "../secure-confirm";

export function ManageAccount({ account, onlyAccount }: { account: AccountView; onlyAccount: boolean }) {
  const router = useRouter();
  const [op, setOp] = useState<"remove" | "default" | null>(null);
  const [done, setDone] = useState<{ op: "remove" | "default"; email: string } | null>(null);
  const [frozen, setFrozen] = useState(false);

  if (done) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5 py-4">
        <CheckCircle2Icon aria-hidden className="size-12 text-emerald-600" />
        <h1 className="text-2xl font-semibold">{done.op === "remove" ? "Account removed" : "Default account changed"}</h1>
        {frozen ? (
          <p className="rounded-xl border p-4 text-sm">Withdrawals are frozen. Nothing can leave your balance until you unfreeze them in Account.</p>
        ) : (
          <FreezeNotice
            email={done.email}
            onFreeze={async () => {
              await freezeWithdrawals();
              setFrozen(true);
            }}
          />
        )}
        <Button className={primaryButton} onClick={() => router.push("/account#payouts")}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <FlowHeader title="Account" steps={[]} step={-1} backHref="/account#payouts" onBack={op ? () => setOp(null) : undefined} />
      <div className="rounded-xl border p-4">
        <AccountSummary account={account} />
        <p className="mt-3 text-sm text-muted-foreground">{EXPECTED_TIME[account.type]}.</p>
      </div>

      {!op && (
        <div className="flex flex-col gap-2">
          {!account.isDefault && (
            <Button variant="outline" className={primaryButton} onClick={() => setOp("default")}>
              Make this the default
            </Button>
          )}
          <Button variant="outline" className={`${primaryButton} text-red-700 dark:text-red-400`} onClick={() => setOp("remove")}>
            Remove this account
          </Button>
          {onlyAccount && <p className="text-sm text-muted-foreground">It&apos;s your only account. You&apos;ll need to add another before you can withdraw.</p>}
        </div>
      )}

      {op && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">{op === "remove" ? "Remove this account?" : "Make this your default?"}</h2>
          <SecureConfirm
            change={{ op, accountId: account.id }}
            confirmLabel={op === "remove" ? "Remove account" : "Make default"}
            onDone={(r) => setDone({ op, email: r.email })}
          />
        </section>
      )}
    </div>
  );
}
