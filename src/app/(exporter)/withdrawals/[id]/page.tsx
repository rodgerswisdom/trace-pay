import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { CheckIcon, CircleIcon, XIcon } from "lucide-react";
import { requireExporter } from "@/auth";
import { db } from "@/db";
import { withdrawals } from "@/db/schema";
import { primaryButton } from "@/components/bottom-bar";
import { FlowHeader } from "@/components/flow-header";
import { ProviderMark, WithdrawalStatusTag } from "@/components/getting-paid";
import { LiveRefresh } from "@/components/live-refresh";
import { buttonVariants } from "@/components/ui/button";
import { fmtTimeEAT } from "@/lib/deals";
import { EXPECTED_TIME } from "@/lib/getting-paid";
import { fmt } from "@/lib/money";
import { refreshWithdrawal } from "@/lib/payouts-server";
import { cn } from "@/lib/utils";

export default async function WithdrawalPage({ params }: PageProps<"/withdrawals/[id]">) {
  const exporter = await requireExporter();
  const { id } = await params;
  const found = await db.query.withdrawals.findFirst({
    where: and(eq(withdrawals.id, id), eq(withdrawals.exporterId, exporter.id)),
    with: { account: true },
  });
  if (!found) notFound();
  const w = { ...found, ...(await refreshWithdrawal(found)) };
  const a = w.account;
  const failed = w.status === "failed";
  const received = w.status === "received";

  const steps = [
    { label: "Initiated", at: w.createdAt, done: true },
    { label: "On its way", at: w.sentAt, done: !!w.sentAt },
    { label: "Received", at: w.receivedAt, done: received },
  ];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <FlowHeader title="Withdrawal" steps={[]} step={-1} backHref="/withdrawals" />
      {!received && !failed && <LiveRefresh url={`/api/withdrawals/${w.id}/status`} version={w.status} intervalMs={3000} />}

      <section className="flex flex-col items-center gap-3 rounded-xl border p-6 text-center">
        {received ? (
          <svg viewBox="0 0 52 52" className="size-16" aria-hidden>
            <circle cx="26" cy="26" r="24" className="check-circle fill-none stroke-emerald-600" strokeWidth="3" />
            <path d="M15 27l7 7 15-16" className="check-mark fill-none stroke-emerald-600" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
        <p className="text-3xl font-semibold tabular-nums">{fmt(w.receiveMinor, "KES")}</p>
        <WithdrawalStatusTag status={w.status} />
        <p className="text-sm text-muted-foreground">
          {received
            ? `Received in your ${a.provider} account`
            : failed
              ? "It didn't reach your account. The money is back in your balance."
              : `${EXPECTED_TIME[a.type]}. You can leave this page.`}
        </p>
        {w.practice && <p className="text-xs text-muted-foreground">Practice withdrawal: no money moved.</p>}
      </section>

      {!failed && (
        <ol className="flex flex-col" aria-label="Progress">
          {steps.map((s, i) => (
            <li key={s.label} className="flex gap-3">
              <span className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full",
                    s.done ? (s.label === "Received" ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground") : "border-2 border-muted-foreground/30",
                  )}
                >
                  {s.done ? <CheckIcon aria-hidden className="size-4" /> : <CircleIcon aria-hidden className="size-2 fill-current text-muted-foreground/40" />}
                </span>
                {i < steps.length - 1 && <span className={cn("w-0.5 flex-1", steps[i + 1].done ? "bg-primary" : "bg-muted")} />}
              </span>
              <span className="pb-5">
                <span className={cn("block font-medium", !s.done && "text-muted-foreground")}>{s.label}</span>
                <span className="block text-sm text-muted-foreground">
                  {s.at ? fmtTimeEAT(s.at) : s.label === "Received" ? EXPECTED_TIME[a.type] : "Waiting"}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {failed && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          <XIcon aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Didn&apos;t go through</p>
            <p>{w.failureReason ?? "The bank or M-Pesa turned it down."}</p>
            <p className="mt-1">Check the account details, then try again.</p>
          </div>
        </div>
      )}

      <dl className="divide-y rounded-xl border text-sm">
        <div className="flex items-center gap-3 p-4">
          <ProviderMark type={a.type} provider={a.provider} />
          <div className="min-w-0">
            <dt className="sr-only">To</dt>
            <dd className="font-medium">
              {a.provider} <span className="text-muted-foreground tabular-nums">•••• {a.last4}</span>
            </dd>
            <dd className="truncate text-muted-foreground">{a.accountName}</dd>
          </div>
        </div>
        <Row term="From your balance" value={fmt(w.amountMinor, w.currency)} />
        {w.currency !== "KES" && <Row term="Rate" value={`1 ${w.currency} = KES ${w.fxRate.toFixed(2)}`} />}
        <Row term="Fee" value={fmt(w.feeMinor, "KES")} />
        <Row term="Reference" value={w.reference} mono />
        {w.payazaReference && <Row term="Payaza reference" value={w.payazaReference} mono />}
      </dl>

      {failed ? (
        <Link href="/withdraw" className={cn(buttonVariants(), primaryButton)}>
          Try again
        </Link>
      ) : (
        <Link href="/home" className={cn(buttonVariants({ variant: received ? "default" : "outline" }), primaryButton)}>
          Back to Home
        </Link>
      )}
    </div>
  );
}

function Row({ term, value, mono }: { term: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 p-4">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className={cn("text-right", mono && "font-mono text-xs break-all")}>{value}</dd>
    </div>
  );
}
