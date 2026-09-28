import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { amountsDue, loadDeal } from "@/lib/deals";
import { container } from "@/lib/layout";
import { fmt } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ArrivalForm } from "./arrival-form";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "same-origin" };

export default async function ArrivalPage({ params, searchParams }: PageProps<"/b/[token]/arrival">) {
  const { token } = await params;
  const { issue } = await searchParams;
  const data = await loadDeal({ buyerToken: token });
  if (!data) notFound();
  const { deal, payments, readings } = data;
  if (!deal.proofLockedAt || deal.arrivedAt || !["proof_attached", "awaiting_arrival"].includes(deal.status)) redirect(`/b/${token}`);

  const due = amountsDue(deal);
  const balancePaid = payments.some((p) => p.kind === "balance" && p.status !== "pending");
  const hold = balancePaid ? { label: "final payment", amount: due.final } : { label: "balance", amount: due.balance };
  const origin = readings.find((r) => r.stage === "origin");

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b">
        <div className={cn(container, "flex h-12 items-center justify-between text-sm md:h-14")}>
          <span className="font-semibold tracking-wide text-primary">TRACE Pay</span>
          <span className="text-muted-foreground">Secure deal link · no account needed</span>
        </div>
      </div>
      <main className={cn(container, "flex max-w-2xl flex-1 flex-col gap-5 pt-4 pb-6 md:pt-8")}>
        <Link href={`/b/${token}`} className="-ml-1 flex h-11 w-fit items-center px-1 text-sm text-muted-foreground hover:text-foreground">
          ← Deal {deal.number}
        </Link>
        <div className="-mt-3">
          <h1 className="text-2xl font-semibold md:text-3xl">Confirm arrival</h1>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">
            Test the fruit the same way the packhouse did, so both readings can be compared against the agreed terms.
          </p>
        </div>

        <section className="rounded-xl border bg-muted/30 p-4 text-sm">
          <h2 className="font-semibold">What was agreed, and what the packhouse recorded</h2>
          <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {deal.minDryMatterPct != null && (
              <div>
                <dt className="text-muted-foreground">Minimum dry matter</dt>
                <dd className="font-medium">{deal.minDryMatterPct}%</dd>
              </div>
            )}
            {deal.tempMinC != null && deal.tempMaxC != null && (
              <div>
                <dt className="text-muted-foreground">Transit temperature</dt>
                <dd className="font-medium">
                  {deal.tempMinC}–{deal.tempMaxC} °C
                </dd>
              </div>
            )}
            {origin && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Packhouse reading</dt>
                <dd className="font-medium">
                  {origin.dryMatterPct.toFixed(1)}% dry matter · {origin.sampleSize} fruit · {origin.device}
                </dd>
              </div>
            )}
          </dl>
        </section>

        <ArrivalForm
          token={token}
          currency={deal.currency}
          startWithIssue={issue === "1"}
          hold={hold}
          finalOnArrival={!balancePaid ? null : due.final > 0 ? fmt(due.final, deal.currency) : null}
        />
      </main>
    </div>
  );
}
