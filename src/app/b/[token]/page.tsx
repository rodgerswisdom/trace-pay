import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomBar, primaryButton } from "@/components/bottom-bar";
import { LiveRefresh } from "@/components/live-refresh";
import { LocalTime } from "@/components/local-time";
import { ProofGallery } from "@/components/proof-gallery";
import { ClaimCheckCard, QualityTerms, ReadingsCompared, TransitSummary } from "@/components/quality";
import { PayButton } from "@/components/pay-button";
import { buttonVariants } from "@/components/ui/button";
import type { Claim } from "@/db/schema";
import { claimCheckFor } from "@/lib/claim-check";
import { RELEVANT_PROOF } from "@/lib/claims";
import { amountsDue, loadDeal, nextDue } from "@/lib/deals";
import { strings } from "@/lib/i18n";
import { container } from "@/lib/layout";
import { fmt } from "@/lib/money";
import { cn } from "@/lib/utils";
import { dealVersion } from "@/lib/version";


// The link is the login: keep it out of search engines, and never send it as a Referer to other sites
// (same-origin still lets our own form posts carry an Origin, which Next requires for server actions).
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "same-origin" };

const s = strings.en; // Buyer side is English.
const KIND_LABEL = { deposit: "deposit", balance: "balance", final: "final payment" } as const;

export default async function BuyerDealPage({ params, searchParams }: PageProps<"/b/[token]">) {
  const { token } = await params;
  const { returned, phone: phoneError, claim: claimFlag, arrival: arrivalFlag, payment: paymentFlag } = await searchParams;
  const data = await loadDeal({ buyerToken: token });
  if (!data) notFound();
  const { deal, payments, claims, proof, documents, readings, transitLog } = data;
  const exporterName = deal.exporter.businessName;
  const claim = claims.at(-1);
  const due = amountsDue(deal, claims);
  const version = (await dealVersion(deal.id)) ?? "";
  const paidOf = (kind: "deposit" | "balance" | "final") => payments.find((p) => p.kind === kind && p.status !== "pending");
  const c = deal.currency;

  const next = nextDue(deal, payments, claims);
  const paidInFull = deal.status === "balance_paid" || deal.status === "settled";
  const confirming = !!returned && !!next && returned === next.kind;
  const canArrive = !!deal.proofLockedAt && !deal.arrivedAt && (deal.status === "proof_attached" || deal.status === "awaiting_arrival") && !confirming;
  const check = claim ? claimCheckFor({ deal, claim, readings, transitLog }) : null;

  const tranches = [
    { kind: "deposit" as const, label: `Deposit (${deal.depositPct}%)`, amount: due.deposit, when: "Now" },
    { kind: "balance" as const, label: "Balance", amount: due.balance, when: "After proof of dispatch" },
    ...(deal.finalPct > 0 ? [{ kind: "final" as const, label: `Final payment (${deal.finalPct}%)`, amount: due.final, when: "When you confirm arrival" }] : []),
  ];
  const trancheStatus = (kind: "deposit" | "balance" | "final") =>
    paidOf(kind) ? "Paid" : confirming && next?.kind === kind ? "Confirming…" : next?.kind === kind ? "Due now" : claim?.status === "open" && claim.appliesTo === kind ? "On hold" : "Later";

  // Once a claim exists, show the proof most relevant to it first.
  const proofOrder = claim ? RELEVANT_PROOF[claim.reason] : [];
  const sortedProof = [...proof].sort((a, b) => rank(proofOrder, a.type) - rank(proofOrder, b.type));

  return (
    <div className="flex flex-1 flex-col">
      <LiveRefresh url={`/api/b/${token}/status`} version={version} />
      <div className="border-b">
        <div className={cn(container, "flex h-12 items-center justify-between text-sm md:h-14")}>
          <span className="font-semibold tracking-wide text-primary">TRACE Pay</span>
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

          {paymentFlag === "failed" && next && (
            <Banner tone="warn">Payment didn&apos;t go through. You haven&apos;t been charged. You can try again below.</Banner>
          )}

          {deal.status === "deposit_paid" && (
            <Banner tone="success">
              Payment received. {exporterName} will add proof of dispatch before the balance is due.
              {paidOf("deposit")?.payazaReference && <span className="mt-1 block font-mono text-xs opacity-80">Payaza ref {paidOf("deposit")!.payazaReference}</span>}
            </Banner>
          )}

          {deal.status === "proof_attached" && !confirming && <Banner tone="info">Proof of dispatch added. Balance due: {fmt(due.balance, c)}.</Banner>}

          {deal.status === "awaiting_arrival" && (
            <Banner tone="success">
              Balance received. When the fruit arrives, confirm arrival with your own dry-matter test.
              {due.final > 0 && ` The final payment of ${fmt(due.final, c)} is requested then.`}
            </Banner>
          )}

          {deal.status === "final_due" && !confirming && (
            <Banner tone="info">
              {arrivalFlag === "confirmed" ? "Arrival confirmed. " : ""}Final payment due: {fmt(due.final, c)}.
            </Banner>
          )}

          {deal.status === "claim_open" && claim && (
            <Banner tone={claimFlag === "sent" ? "success" : "warn"}>
              {claimFlag === "sent" ? "Sent. " : ""}The exporter will respond here. The {claim.appliesTo === "final" ? "final payment" : "balance"} is on hold until you both agree.
              <ClaimSummary claim={claim} currency={c} />
            </Banner>
          )}

          {deal.status === "balance_agreed" && claim && !confirming && (
            <Banner tone="info">
              <ResponseText claim={claim} exporterName={exporterName} currency={c} />
              {claim.responseNote && <span className="mt-2 block border-l-2 border-current/30 pl-3 text-sm font-normal">&ldquo;{claim.responseNote}&rdquo;</span>}
              {next && (
                <span className="mt-2 block">
                  {KIND_LABEL[next.kind][0].toUpperCase() + KIND_LABEL[next.kind].slice(1)} due now: {fmt(next.amountMinor, c)}.
                </span>
              )}
            </Banner>
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
                  <span className="mt-1 block">Quality claim: {claim.agreedAmountMinor ? `${fmt(claim.agreedAmountMinor, c)} taken off` : "no reduction"}.</span>
                )}
              </span>
            </Banner>
          )}

          {check && (
            <section>
              <h2 className="mb-2 font-semibold">{s.deal.check}</h2>
              <ClaimCheckCard check={check} s={s.deal} currency={c} />
            </section>
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
            <h2 className="mb-1 font-semibold">Quality terms</h2>
            <p className="mb-3 text-sm text-muted-foreground">Agreed before the deposit. Any quality claim is checked against these.</p>
            <QualityTerms deal={deal} s={s.deal} />
          </section>

          <section>
            <h2 className="mb-1 font-semibold">Documents from the exporter</h2>
            <p className="mb-3 text-sm text-muted-foreground">These files were provided before payment and are part of the deal record.</p>
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pre-payment documents have been added.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {documents.map((document) => (
                  <li key={document.id} className="flex items-center gap-3 rounded-xl border p-3">
                    {document.contentType.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element -- private, token-scoped document route
                      <img src={`/b/${token}/documents/${document.id}`} alt="" className="size-14 shrink-0 rounded-md bg-muted object-cover" />
                    ) : (
                      <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-medium uppercase text-muted-foreground">PDF</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <a href={`/b/${token}/documents/${document.id}`} target="_blank" rel="noopener" className="truncate text-sm font-medium hover:underline">{document.fileName}</a>
                      <p className="text-xs text-muted-foreground">{DOCUMENT_CATEGORY_LABELS[document.category]} · {(document.sizeBytes / 1024).toFixed(0)} KB</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
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
              <h2 className="mb-1 font-semibold">{claim?.status === "rejected" ? "The proof they pointed to" : "Proof of dispatch"}</h2>
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
              <li className="md:rounded-xl md:bg-muted/50 md:p-4">3. On arrival, record your own test{deal.finalPct > 0 ? " and pay the final part" : ""}.</li>
              <li className="md:rounded-xl md:bg-muted/50 md:p-4">4. A quality issue is checked against the agreed terms.</li>
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
                    {fmt(paidOf(t.kind)?.amountMinor ?? t.amount, c)} · {trancheStatus(t.kind)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          {((next && !confirming) || canArrive) && (
            <BottomBar>
              {next && !confirming && (
                <PayButton
                  token={token}
                  label={`Pay ${KIND_LABEL[next.kind]} · ${fmt(next.amountMinor, c)}`}
                  needsPhone={!deal.buyerPhone}
                  phoneInvalid={phoneError === "invalid"}
                />
              )}
              {canArrive && (
                <Link href={`/b/${token}/arrival`} className={cn(buttonVariants({ variant: next && !confirming ? "outline" : "default" }), primaryButton)}>
                  Fruit arrived? Confirm arrival
                </Link>
              )}
            </BottomBar>
          )}
          <p className="hidden text-xs text-muted-foreground md:block">Payments are processed by Payaza. No account needed.</p>
        </aside>
      </main>
    </div>
  );
}

const rank = (order: readonly string[], type: string) => (order.includes(type) ? order.indexOf(type) : order.length);
const DOCUMENT_CATEGORY_LABELS = {
  quality_certificate: "Quality certificate",
  phytosanitary: "Phytosanitary certificate",
  origin_traceability: "Origin and traceability",
  inspection_report: "Inspection report",
  product_photos: "Product photos",
} as const;

function ClaimSummary({ claim, currency }: { claim: Claim; currency: string }) {
  return (
    <span className="mt-2 block text-sm font-normal">
      You reported: {s.claimsList.reason[claim.reason]} · asked {fmt(claim.amountRequestedMinor, currency)} off ·{" "}
      <LocalTime iso={claim.createdAt.toISOString()} />
      <span className="mt-1 block opacity-80">&ldquo;{claim.description}&rdquo;</span>
    </span>
  );
}

function ResponseText({ claim, exporterName, currency }: { claim: Claim; exporterName: string; currency: string }) {
  const what = claim.appliesTo === "final" ? "final payment" : "balance";
  if (claim.status === "accepted") return <>{exporterName} accepted your claim: {fmt(claim.agreedAmountMinor ?? 0, currency)} off the {what}.</>;
  if (claim.status === "countered")
    return (
      <>
        {exporterName} offered {fmt(claim.agreedAmountMinor ?? 0, currency)} off instead of {fmt(claim.amountRequestedMinor, currency)}.
      </>
    );
  return <>{exporterName} didn&apos;t accept the claim and pointed to their proof of dispatch below. The {what} stays the same.</>;
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
  warn: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
  muted: "bg-muted text-muted-foreground",
};

function Banner({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return (
    <div role="status" className={`rounded-xl border p-4 font-medium ${TONES[tone]}`}>
      {children}
    </div>
  );
}
