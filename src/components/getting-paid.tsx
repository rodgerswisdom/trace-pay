import { CheckCircle2Icon, Clock3Icon, XCircleIcon } from "lucide-react";
import type { PayoutAccountType, WithdrawalStatus } from "@/db/schema";
import { WITHDRAWAL_STATUS_TEXT, holdLabel, maskedNumber, type AccountView } from "@/lib/getting-paid";
import { cn } from "@/lib/utils";

// Shared pieces for the getting-paid screens. Status always has a word beside the colour:
// amber for waiting, green for received, red only for failed.

const INITIALS: Record<string, string> = {
  "Equity Bank": "EQ",
  "KCB Bank": "KCB",
  "Co-operative Bank": "CO",
  "NCBA Bank": "NC",
  "Absa Bank Kenya": "AB",
  "Standard Chartered": "SC",
  "Stanbic Bank": "SB",
  "Diamond Trust Bank": "DT",
  "I&M Bank": "IM",
  "Family Bank": "FB",
  "National Bank of Kenya": "NB",
};

/** A small mark for the provider. Not the provider's logo: a plain monogram. */
export function ProviderMark({ type, provider, className }: { type: PayoutAccountType; provider: string; className?: string }) {
  const mpesa = type.startsWith("mpesa");
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold tracking-tight",
        mpesa ? "bg-emerald-600 text-white" : "bg-muted text-foreground",
        className,
      )}
    >
      {mpesa ? "M" : (INITIALS[provider] ?? provider.slice(0, 2).toUpperCase())}
    </span>
  );
}

export function AccountSummary({ account, now, dim }: { account: AccountView; now?: number; dim?: boolean }) {
  const hold = holdLabel(account.activeAt, now);
  return (
    <span className={cn("flex min-w-0 flex-1 items-center gap-3", dim && "opacity-55")}>
      <ProviderMark type={account.type} provider={account.provider} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-medium">{account.provider}</span>
          <span className="text-sm text-muted-foreground tabular-nums">{maskedNumber(account)}</span>
        </span>
        <span className="block truncate text-sm text-muted-foreground">{account.accountName}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {account.isDefault && <Tag tone="plain">Default</Tag>}
        {hold && (
          <Tag tone="amber">
            <Clock3Icon aria-hidden className="size-3.5" />
            {hold}
          </Tag>
        )}
      </span>
    </span>
  );
}

export function Tag({ tone, children }: { tone: "plain" | "amber" | "green" | "red"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tone === "plain" && "border text-foreground",
        tone === "amber" && "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
        tone === "green" && "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
        tone === "red" && "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
      )}
    >
      {children}
    </span>
  );
}

export function WithdrawalStatusTag({ status }: { status: WithdrawalStatus }) {
  const Icon = status === "received" ? CheckCircle2Icon : status === "failed" ? XCircleIcon : Clock3Icon;
  return (
    <Tag tone={status === "received" ? "green" : status === "failed" ? "red" : "amber"}>
      <Icon aria-hidden className="size-3.5" />
      {WITHDRAWAL_STATUS_TEXT[status]}
    </Tag>
  );
}

/** Stands in for the SMS until a provider is connected. */
export function DemoCodeNote({ code, sentTo }: { code: string; sentTo: string }) {
  return (
    <p className="rounded-lg border border-dashed p-3 text-sm">
      We&apos;d text a 6-digit code to {sentTo}. <span className="text-muted-foreground">Demo: SMS isn&apos;t connected, so here it is:</span>{" "}
      <span className="font-mono text-base font-semibold tracking-widest">{code}</span>
    </p>
  );
}
