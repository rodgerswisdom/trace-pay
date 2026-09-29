import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { requireExporter } from "@/auth";
import { FlowHeader } from "@/components/flow-header";
import { ProviderMark, WithdrawalStatusTag } from "@/components/getting-paid";
import { buttonVariants } from "@/components/ui/button";
import { fmtTimeEAT } from "@/lib/deals";
import { fmt } from "@/lib/money";
import { loadWithdrawals } from "@/lib/payouts-server";
import { cn } from "@/lib/utils";

export default async function WithdrawalsPage() {
  const exporter = await requireExporter();
  const list = await loadWithdrawals(exporter.id);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <FlowHeader title="Withdrawals" steps={[]} step={-1} backHref="/home" />
      {list.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-5">
          <p className="font-medium">No withdrawals yet</p>
          <p className="text-sm text-muted-foreground">When you withdraw from your balance, each one shows here with where it went.</p>
          <Link href="/withdraw" className={cn(buttonVariants(), "h-12 px-6 text-base")}>
            Withdraw
          </Link>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {list.map((w) => (
            <li key={w.id}>
              <Link href={`/withdrawals/${w.id}`} className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/50">
                <ProviderMark type={w.account.type} provider={w.account.provider} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium tabular-nums">{fmt(w.receiveMinor, "KES")}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {w.account.provider} •••• {w.account.last4} · {fmtTimeEAT(w.createdAt)}
                    {w.practice ? " · practice" : ""}
                  </p>
                </div>
                <WithdrawalStatusTag status={w.status} />
                <ChevronRightIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
