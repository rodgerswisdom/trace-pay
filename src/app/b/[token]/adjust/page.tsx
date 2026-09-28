import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { amountsDue, loadDeal } from "@/lib/deals";
import { container } from "@/lib/layout";
import { fmt, kesRate } from "@/lib/money";
import {
  adjustmentFor,
  agreedTerms,
  termEvidenceLine,
  termFields,
  termName,
  termRequirements,
  termStandard,
  windowEndsAt,
  type TermKey,
} from "@/lib/terms";
import { cn } from "@/lib/utils";
import { AdjustFlow, type TermOption } from "./adjust-flow";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "same-origin" };

export default async function AdjustPage({ params }: PageProps<"/b/[token]/adjust">) {
  const { token } = await params;
  const data = await loadDeal({ buyerToken: token });
  if (!data) notFound();
  const { deal, payments } = data;

  const balancePaid = payments.some((p) => p.kind === "balance" && p.status !== "pending");
  const due = amountsDue(deal);
  const tranche = balancePaid ? { label: "Final payment", amount: due.final } : { label: "Balance", amount: due.balance };
  const ends = windowEndsAt(deal);
  const terms = agreedTerms(deal);

  // Empty and error states, before any step.
  let blocked: { title: string; body: string } | null = null;
  if (!deal.proofLockedAt || deal.status === "awaiting_deposit" || deal.status === "deposit_paid") {
    blocked = { title: "Not yet", body: "You can request an adjustment once the fruit has been dispatched and has arrived." };
  } else if (deal.arrivedAt) {
    blocked = { title: "Delivery already confirmed", body: "This delivery has already been accepted or reviewed, so a new adjustment can't be requested here." };
  } else if (!["proof_attached", "awaiting_arrival"].includes(deal.status) || tranche.amount <= 0) {
    blocked = { title: "Balance already paid", body: "There's no unpaid amount left on this deal, so there's nothing to adjust." };
  } else if (ends && ends < new Date()) {
    blocked = {
      title: "The window has closed",
      body: `Adjustments could be requested until ${ends.toUTCString().slice(5, 22)} UTC, as agreed in the terms.`,
    };
  } else if (terms.length === 0) {
    blocked = { title: "No quality terms on this deal", body: "This deal didn't agree any quality terms, so there's nothing to check against." };
  }

  if (blocked) {
    return (
      <main className={cn(container, "flex max-w-lg flex-1 flex-col justify-center gap-4 py-16")}>
        <div className="flex items-center gap-3">
          <Logo height={22} />
          <span className="text-sm text-muted-foreground">Deal {deal.number}</span>
        </div>
        <h1 className="text-2xl font-semibold">{blocked.title}</h1>
        <p className="text-muted-foreground">{blocked.body}</p>
        <Link href={`/b/${token}`} className={cn(buttonVariants({ variant: "outline" }), "h-12 w-fit px-6 text-base")}>
          Back to the deal
        </Link>
      </main>
    );
  }

  const adjustment = adjustmentFor(deal, tranche.amount);
  const options: TermOption[] = terms.map((key: TermKey) => ({
    key,
    name: termName(key),
    standard: termStandard(key, deal),
    evidenceLine: termEvidenceLine(key),
    fields: termFields(key),
    requirements: { inspector: termRequirements(key, "inspector"), buyer: termRequirements(key, "buyer") },
    // What "below the term" means for this field, for the live check on step 2.
    rule:
      key === "dry_matter"
        ? { kind: "min" as const, value: deal.minDryMatterPct! }
        : key === "temperature"
          ? { kind: "range" as const, min: deal.tempMinC!, max: deal.tempMaxC! }
          : { kind: "min" as const, value: Math.round(deal.weightKg * (1 - deal.weightTolerancePct! / 100) * 10) / 10 },
  }));

  return (
    <AdjustFlow
      token={token}
      dealNumber={deal.number}
      exporterName={deal.exporter.businessName}
      terms={options}
      currency={deal.currency}
      kesRate={kesRate(deal.currency)}
      tranche={tranche}
      adjustmentMinor={adjustment}
      adjustPct={deal.breachAdjustPct ?? 0}
      totalLabel={fmt(deal.totalMinor, deal.currency)}
      windowEndsAt={ends!.toISOString()}
    />
  );
}
