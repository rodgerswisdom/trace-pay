import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { ArrivalChoice, WithdrawLink } from "@/components/arrival-actions";
import { BottomBar } from "@/components/bottom-bar";
import { DeadlineChip } from "@/components/deadline-chip";
import { LiveRefresh } from "@/components/live-refresh";
import { LocalTime } from "@/components/local-time";
import { PayButton } from "@/components/pay-button";
import { ProofGallery } from "@/components/proof-gallery";
import { AdjustmentCheck, QualityTerms, ReadingsCompared, TransitSummary } from "@/components/quality";
import type { Claim } from "@/db/schema";
import { claimCheckFor } from "@/lib/claim-check";
import { RELEVANT_PROOF } from "@/lib/claims";
import { amountsDue, loadDeal, nextDue } from "@/lib/deals";
import { strings } from "@/lib/i18n";
import { container } from "@/lib/layout";
import { fmt, kesRate, toKesMinor } from "@/lib/money";
import { REASON_TERM, agreedTerms, termName, windowEndsAt } from "@/lib/terms";
import { cn } from "@/lib/utils";
import { dealVersion } from "@/lib/version";
import { Logo } from "@/components/logo";

// The link is the login: keep it out of search engines, and never send it as a Referer to other sites
// (same-origin still lets our own form posts carry an Origin, which Next requires for server actions).
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "same-origin" };

// Buyer side is English. Calm, checkout-like wording: "adjustment", "agreed terms", "check", "balance".
const s = strings.en;
const KIND_LABEL = { deposit: "deposit", balance: "balance", final: "final payment" } as const;

export default async function BuyerDealPage({ params, searchParams }: PageProps<"/b/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const { returned, phone: phoneError, payment: paymentFlag, adjustment: adjustmentFlag, delivery: deliveryFlag, notice } = sp;
  const data = await loadDeal({ buyerToken: token });
  if (!data) notFound();
  const { deal, payments, claims, proof, readings, transitLog } = data;
  const exporterName = deal.exporter.businessName;
  const claim = claims.filter((cl) => cl.status !== "withdrawn").at(-1);
  const due = amountsDue(deal, claims);
  const version = (await dealVersion(deal.id)) ?? "";
  const paidOf = (kind: "deposit" | "balance" | "final") => payments.find((p) => p.kind === kind && p.status !== "pending");
  const c = deal.currency;
  const rate = kesRate(c);
  const both = (minor: number) => `${fmt(minor, c)} · ${fmt(Math.round(toKesMinor(minor, rate) / 100) * 100, "KES")}`;

  const next = nextDue(deal, payments, claims);
  const paidInFull = deal.status === "balance_paid" || deal.status === "settled";
  const confirming = !!returned && !!next && returned === next.kind;
  const check = claim ? claimCheckFor({ deal, claim, readings, transitLog }) : null;

  // Arrival: after dispatch, before delivery is confirmed.
  const onArrival = !!deal.proofLockedAt && !deal.arrivedAt && (deal.status === "proof_attached" || deal.status === "awaiting_arrival");
  const ends = windowEndsAt(deal);
  const windowOpen = !!ends && ends > new Date();
  const heldAmount = paidOf("balance") ? due.final : due.balance;
  const canAdjust = onArrival && windowOpen && agreedTerms(deal).length > 0 && heldAmount > 0;

  const tranches = [
    { kind: "deposit" as const, label: `Deposit (${deal.depositPct}%)`, amount: due.deposit, when: "Now" },
    { kind: "balance" as const, label: "Balance", amount: due.balance, when: "After proof of dispatch" },
    ...(deal.finalPct > 0 ? [{ kind: "final" as const, label: `Final payment (${deal.finalPct}%)`, amount: due.final, when: "When the delivery is accepted" }] : []),
  ];
  const trancheStatus = (kind: "deposit" | "balance" | "final") =>
    paidOf(kind) ? "Paid" : confirming && next?.kind === kind ? "Confirming…" : next?.kind === kind ? "Due now" : claim?.status === "open" && claim.appliesTo === kind ? "On hold" : "Later";

  // Once an adjustment was requested, show the proof most relevant to it first.
  const proofOrder = claim ? RELEVANT_PROOF[claim.reason] : [];
  const sortedProof = [...proof].sort((a, b) => rank(proofOrder, a.type) - rank(proofOrder, b.type));

  return (
    <div className="flex flex-1 flex-col">
      <LiveRefresh url={`/api/b/${token}/status`} version={version} />
      <div className="border-b">
        <div className={cn(container, "flex h-12 items-center justify-between text-sm md:h-14")}>
          <Logo height={20} priority />
          <span className="text-muted-foreground">Secure deal link · no account needed</span>
        </div>
      </div>

      <main
        className={cn(
          container,
          "flex flex-1 flex-col gap-5 pt-6 pb-6 md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-8 md:pt-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12",
        )}
      >
        <div className="flex flex-col gap-5 md:gap-6">
          <header>
            <p className="text-sm font-medium text-primary">{exporterName}</p>
            <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Deal {deal.number}</h1>
            <p className="text-muted-foreground md:text-lg">
              {deal.product} avocados · {deal.weightKg.toLocaleString("en-US")} kg → {deal.destination}
            </p>
          </header>

          {typeof notice === "string" && <Banner tone="muted">{notice}</Banner>}
          {deal.status === "cancelled" && <Banner tone="muted">This deal was cancelled by {exporterName}. No payment is due.</Banner>}

          {confirming && (
            <Banner tone="info">
              <span className="inline-flex items-center gap-2">
                <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Confirming payment with Payaza…
              </span>
              <span className="mt-1 block text-sm opacity-80">This usually takes a few seconds. You can keep this page open.</span>
            </Banner>
          )}
          {paymentFlag === "failed" && next && <Banner tone="muted">Payment didn&apos;t go through. You haven&apos;t been charged. You can try again below.</Banner>}

          {deal.status === "deposit_paid" && (
            <Banner tone="success">
              Payment received. {exporterName} will add proof of dispatch before the balance is due.
              {paidOf("deposit")?.payazaReference && <span className="mt-1 block font-mono text-xs opacity-80">Payaza ref {paidOf("deposit")!.payazaReference}</span>}
            </Banner>
          )}

          {/* Arrival: two equal choices, no nudging, no warning colours. */}
          {onArrival && !confirming && (
            <section className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 md:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">When your fruit arrives</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {canAdjust
                      ? "Check it against the agreed terms. Accept the delivery, or request an adjustment if a term isn't met."
                      : windowOpen
                        ? "Accept the delivery when it arrives."
                        : `Adjustments could be requested until ${ends?.toUTCString().slice(5, 22)} UTC. Accept the delivery to continue.`}
                  </p>
                </div>
                {canAdjust && ends && <DeadlineChip endsAt={ends.toISOString()} />}
              </div>
              <ArrivalChoice
                token={token}
                canAdjust={canAdjust}
                finalNote={deal.status === "awaiting_arrival" && due.final > 0 ? `The final payment of ${fmt(due.final, c)} will be due.` : null}
              />
            </section>
          )}

          {deal.status === "proof_attached" && !confirming && <Banner tone="info">Proof of dispatch added. Balance due: {fmt(due.balance, c)}.</Banner>}
          {deal.status === "awaiting_arrival" && !onArrival && <Banner tone="success">Balance received.</Banner>}
          {deal.status === "final_due" && !confirming && (
            <Banner tone="info">
              {deliveryFlag === "accepted" ? "Delivery accepted. " : adjustmentFlag === "withdrawn" ? "Request withdrawn. " : ""}Final payment due: {fmt(due.final, c)}.
            </Banner>
          )}
          {adjustmentFlag === "withdrawn" && deal.status === "proof_attached" && <Banner tone="muted">Request withdrawn. The balance is due as agreed.</Banner>}

          {/* The receipt, while the exporter reviews */}
          {deal.status === "claim_open" && claim && (
            <Receipt claim={claim} token={token} both={both} fresh={adjustmentFlag === "sent"} heldLabel={claim.appliesTo === "final" ? "final payment" : "balance"} heldAmount={claim.appliesTo === "final" ? due.final : due.balance} />
          )}

          {/* The result, once the exporter has confirmed the balance */}
          {claim && check && ["accepted", "countered", "rejected"].includes(claim.status) && (
            <section className="flex flex-col gap-3">
              <h2 className="font-semibold">Adjustment result</h2>
              <AdjustmentCheck
                check={check}
                s={s.deal}
                currency={c}
                sentence={<p className="text-base font-medium">{resultSentence(claim, exporterName, c, next?.amountMinor ?? 0)}</p>}
              />
              {claim.responseNote && (
                <p className="rounded-lg bg-muted/50 p-3 text-sm">
                  <span className="text-muted-foreground">{exporterName}: </span>&ldquo;{claim.responseNote}&rdquo;
                </p>
              )}
            </section>
          )}

          {deal.status === "balance_agreed" && next && !confirming && (
            <section className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
              <p className="text-sm text-muted-foreground">{KIND_LABEL[next.kind][0].toUpperCase() + KIND_LABEL[next.kind].slice(1)} due now</p>
              <p className="text-2xl font-semibold tabular-nums">{fmt(next.amountMinor, c)}</p>
              <p className="text-sm text-muted-foreground tabular-nums">{both(next.amountMinor).split(" · ")[1]}</p>
            </section>
          )}

          {paidInFull && (
            <Banner tone="success">
              Paid in full. Thank you.
              <span className="mt-2 block text-sm font-normal">
                {(["deposit", "balance", "final"] as const)
                  .map((k) => paidOf(k))
                  .filter(Boolean)
                  .map((p) => (
                    <span key={p!.id} className="block">
                      {KIND_LABEL[p!.kind][0].toUpperCase() + KIND_LABEL[p!.kind].slice(1)} {fmt(p!.amountMinor, p!.currency)} ·{" "}
                      <span className="font-mono text-xs">Payaza {p!.payazaReference}</span>
                    </span>
                  ))}
                {claim && claim.status !== "open" && (
                  <span className="mt-1 block">Quality adjustment: {claim.agreedAmountMinor ? `${fmt(claim.agreedAmountMinor, c)} taken off` : "none"}.</span>
                )}
              </span>
            </Banner>
          )}

          <section className="overflow-hidden rounded-xl border">
            {/* Phones: one list. Larger screens: a two-column grid; the 1px gaps over bg-border draw the dividers. */}
            <dl className="divide-y text-sm md:grid md:grid-cols-2 md:gap-px md:divide-y-0 md:bg-border md:text-base">
              <Row term="Price per kg" value={fmt(deal.pricePerKgMinor, c)} />
              <Row term="Total" value={fmt(deal.totalMinor, c)} strong />
              {tranches.map((t) => (
                <Row key={t.kind} term={`${t.label} · ${t.when.toLowerCase()}`} value={fmt(t.amount, c)} />
              ))}
              <Row term="Destination" value={deal.destination} />
              <Row
                term="Expected dispatch"
                value={new Date(`${deal.dispatchDate}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
              />
              <Row term="Buyer" value={`${deal.buyerCompany} · ${deal.buyerContact}`} wide={tranches.length % 2 === 0} />
            </dl>
          </section>

          <section>
            <h2 className="mb-1 font-semibold">Agreed terms</h2>
            <p className="mb-3 text-sm text-muted-foreground">Agreed before the deposit. Any adjustment is checked against these.</p>
            <QualityTerms deal={deal} s={s.deal} />
          </section>

          {deal.proofLockedAt && (
            <section>
              <h2 className="mb-3 font-semibold">{s.deal.readings}</h2>
              <ReadingsCompared readings={readings} minDryMatterPct={deal.minDryMatterPct} s={s.deal} />
            </section>
          )}

          {transitLog && (
            <section>
              <h2 className="mb-3 font-semibold">{s.deal.transit}</h2>
              <TransitSummary log={transitLog} deal={deal} s={s.deal} downloadHref={`/b/${token}/transit`} />
            </section>
          )}

          {deal.proofLockedAt && proof.length > 0 && (
            <section>
              <h2 className="mb-1 flex flex-wrap items-center gap-2 font-semibold">Proof of dispatch</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Each file was recorded by TRACE Pay when {exporterName} uploaded it, and can&apos;t be changed. Tap to view full size.
              </p>
              <ProofGallery items={sortedProof} s={s.proof} fileUrl={(itemId) => `/b/${token}/files/${itemId}`} time="local" />
            </section>
          )}

          <section>
            <h2 className="mb-2 font-semibold">How this deal works</h2>
            <ol className="grid gap-1.5 text-sm text-muted-foreground md:grid-cols-2 md:gap-3 lg:grid-cols-4">
              <li className="md:rounded-xl md:bg-muted/50 md:p-4">1. Pay the deposit.</li>
              <li className="md:rounded-xl md:bg-muted/50 md:p-4">2. See proof of dispatch, then pay the balance.</li>
              <li className="md:rounded-xl md:bg-muted/50 md:p-4">3. On arrival, accept the delivery or request an adjustment.</li>
              <li className="md:rounded-xl md:bg-muted/50 md:p-4">4. Adjustments are checked against the agreed terms.</li>
            </ol>
          </section>

          <p className="text-xs text-muted-foreground md:hidden">Payments are processed by Payaza. No account needed.</p>
        </div>

        {/* Payment panel: sticky beside the terms on larger screens; on phones only the actions show, pinned to the bottom. */}
        <aside className="md:sticky md:top-8 md:flex md:flex-col md:gap-4 md:rounded-xl md:border md:p-5">
          <div className="hidden md:block">
            <h2 className="font-semibold">Payments</h2>
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              {tranches.map((t) => (
                <div key={t.kind} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t.label.replace(/ \(\d+%\)/, "")}</dt>
                  <dd className="text-right font-medium">
                    {fmt(paidOf(t.kind)?.amountMinor ?? t.amount, c)} ·{" "}
                    {trancheStatus(t.kind) === "On hold" ? <OnHold /> : trancheStatus(t.kind)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          {next && !confirming && (
            <BottomBar>
              <PayButton token={token} label={`Pay ${KIND_LABEL[next.kind]} · ${fmt(next.amountMinor, c)}`} needsPhone={!deal.buyerPhone} phoneInvalid={phoneError === "invalid"} />
            </BottomBar>
          )}
          <p className="hidden text-xs text-muted-foreground md:block">Payments are processed by Payaza. No account needed.</p>
        </aside>
      </main>
    </div>
  );
}

const rank = (order: readonly string[], type: string) => (order.includes(type) ? order.indexOf(type) : order.length);

function OnHold() {
  return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">On hold</span>;
}

/** One sentence above the comparison table. Neutral in every case. */
function resultSentence(claim: Claim, exporterName: string, c: string, dueNow: number) {
  const what = claim.appliesTo === "final" ? "final payment" : "balance";
  const term = REASON_TERM[claim.reason];
  const name = term ? termName(term).toLowerCase() : "quality";
  if (claim.status === "accepted") return `Adjustment confirmed: ${fmt(claim.agreedAmountMinor ?? 0, c)} off the ${what} for ${name}.${dueNow ? ` ${fmt(dueNow, c)} is due now.` : ""}`;
  if (claim.status === "countered")
    return `${exporterName} confirmed an adjustment of ${fmt(claim.agreedAmountMinor ?? 0, c)} (the agreed terms set ${fmt(claim.amountRequestedMinor, c)}).${dueNow ? ` ${fmt(dueNow, c)} is due now.` : ""}`;
  return `${exporterName} confirmed the ${what} as agreed, based on the records below.${dueNow ? ` ${fmt(dueNow, c)} is due now.` : ""}`;
}

/** After submitting: a payment-style receipt, with a three-dot timeline. */
function Receipt({
  claim,
  token,
  both,
  fresh,
  heldLabel,
  heldAmount,
}: {
  claim: Claim;
  token: string;
  both: (minor: number) => string;
  fresh: boolean;
  heldLabel: string;
  heldAmount: number;
}) {
  const ref = `ADJ-${claim.id.slice(0, 8).toUpperCase()}`;
  const term = REASON_TERM[claim.reason];
  const steps = ["Submitted", "Exporter reviewing", "Balance confirmed"];
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4 md:p-5" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{fresh ? "Request received" : "Adjustment requested"}</p>
          <p className="text-2xl font-semibold tabular-nums">{both(claim.amountRequestedMinor).split(" · ")[0]}</p>
          <p className="text-sm text-muted-foreground tabular-nums">{both(claim.amountRequestedMinor).split(" · ")[1]}</p>
        </div>
        <OnHold />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Reference</dt>
        <dd className="font-mono">{ref}</dd>
        <dt className="text-muted-foreground">Received</dt>
        <dd>
          <LocalTime iso={claim.createdAt.toISOString()} />
        </dd>
        <dt className="text-muted-foreground">Term</dt>
        <dd>{term ? termName(term) : "Quality"}</dd>
        <dt className="text-muted-foreground">On hold</dt>
        <dd>
          {both(heldAmount).split(" · ")[0]} {heldLabel}
        </dd>
      </dl>
      <ol className="flex items-start" aria-label="Progress">
        {steps.map((label, i) => {
          const done = i === 0;
          const current = i === 1;
          return (
            <li key={label} className="flex flex-1 flex-col items-center gap-1.5 text-center">
              <span className="flex w-full items-center">
                <span className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : "bg-border")} />
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                    done ? "border-primary bg-primary text-primary-foreground" : current ? "border-primary bg-background" : "border-border bg-background",
                  )}
                >
                  {done && <CheckIcon aria-hidden className="size-3.5" />}
                  {current && <span aria-hidden className="size-2 rounded-full bg-primary" />}
                </span>
                <span className={cn("h-0.5 flex-1", i === steps.length - 1 ? "bg-transparent" : "bg-border")} />
              </span>
              <span className={cn("text-xs", current ? "font-medium" : "text-muted-foreground")}>
                {label}
                <span className="sr-only">{done ? " (done)" : current ? " (current)" : " (next)"}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <WithdrawLink token={token} amountLabel={heldLabel} />
    </section>
  );
}

function Row({ term, value, strong, wide }: { term: string; value: string; strong?: boolean; wide?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 bg-background p-3.5 md:p-4", wide && "md:col-span-2")}>
      <dt className="text-muted-foreground">{term}</dt>
      <dd className={strong ? "text-right font-semibold" : "text-right font-medium"}>{value}</dd>
    </div>
  );
}

const TONES = {
  info: "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100",
  success: "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
  muted: "bg-muted text-muted-foreground",
};

function Banner({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return (
    <div role="status" className={`rounded-xl border p-4 font-medium ${TONES[tone]}`}>
      {children}
    </div>
  );
}
