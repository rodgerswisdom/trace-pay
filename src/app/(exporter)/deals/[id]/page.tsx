import Link from "next/link";
import { CameraIcon, FileDownIcon } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireExporter } from "@/auth";
import { db } from "@/db";
import { deals, type Payment } from "@/db/schema";
import { BottomBar, primaryButton } from "@/components/bottom-bar";
import { LiveRefresh } from "@/components/live-refresh";
import { ProofGallery } from "@/components/proof-gallery";
import { ClaimCheckCard, QualityTerms, ReadingsCompared, TransitSummary } from "@/components/quality";
import { TransitAttach } from "@/components/transit-attach";
import { claimCheckFor } from "@/lib/claim-check";
import { StatusChip } from "@/components/status-chip";
import { Timeline } from "@/components/timeline";
import { buttonVariants } from "@/components/ui/button";
import { amountsDue, fmtDateEAT, fmtTimeEAT, loadDeal, recordEvent } from "@/lib/deals";
import { t } from "@/lib/i18n";
import { both, fmt, kesRate } from "@/lib/money";
import { sectionTitle } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { dealVersion } from "@/lib/version";

export default async function DealPage({ params }: PageProps<"/deals/[id]">) {
  const { id } = await params;
  const exporter = await requireExporter();
  const data = await loadDeal({ id, exporterId: exporter.id });
  if (!data) notFound();
  const { deal, payments, events, claims, proof, readings, transitLog } = data;
  const s = t(exporter.language);
  const rate = kesRate(deal.currency);

  const due = amountsDue(deal, claims);
  const version = (await dealVersion(deal.id)) ?? "";

  const next = nextStep(deal.status, deal.id, s);

  async function cancel() {
    "use server";
    const ex = await requireExporter();
    await db.transaction(async (tx) => {
      const [d] = await tx
        .update(deals)
        .set({ status: "cancelled" })
        .where(and(eq(deals.id, id), eq(deals.exporterId, ex.id), eq(deals.status, "awaiting_deposit")))
        .returning();
      if (d) await recordEvent(tx, d.id, "exporter", "cancelled", "Exporter cancelled the deal before the deposit");
    });
    redirect(`/deals/${id}`);
  }

  return (
    <main className="flex flex-1 flex-col gap-5">
      <LiveRefresh url={`/api/deals/${deal.id}/status`} version={version} />
      <Link href="/deals" className="-mt-2 -ml-1 flex h-11 w-fit items-center px-1 text-sm text-muted-foreground hover:text-foreground">
        ← {exporter.language === "sw" ? "Mikataba" : "Deals"}
      </Link>

      {/* 1. Status header */}
      <header className="-mt-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <StatusChip status={deal.status} label={s.status[deal.status]} />
          <h1 className="mt-2 text-2xl font-semibold md:text-3xl">{deal.buyerCompany}</h1>
          <p className="text-sm text-muted-foreground md:text-base">
            {deal.number} · {deal.product} · {deal.weightKg.toLocaleString("en-US")} kg → {deal.destination}
          </p>
        </div>
        <div className="hidden items-center gap-4 md:flex">
          <Link href={`/deals/${deal.id}/bundle`} className="inline-flex h-11 items-center gap-2 text-sm text-primary underline-offset-4 hover:underline">
            <FileDownIcon className="size-4" />
            {s.deal.bundle}
          </Link>
          {deal.status === "awaiting_deposit" && (
            <form action={cancel}>
              <button className="h-11 text-sm text-destructive underline-offset-4 hover:underline">{s.deal.cancel}</button>
            </form>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-5 md:gap-6">
          {/* 2. Next step — on desktop the primary action sits in this card */}
          <section className="flex flex-col gap-4 rounded-xl border bg-muted/50 p-4 md:flex-row md:items-center md:justify-between md:p-5">
            <p className="font-medium md:text-lg">{next.text}</p>
            {next.href && (
              <Link href={next.href} className={cn(buttonVariants(), primaryButton, "hidden md:inline-flex md:w-56 md:shrink-0")}>
                {next.button}
              </Link>
            )}
          </section>

          {/* 3. Money */}
          <section>
            <h2 className={sectionTitle}>{s.deal.money}</h2>
            <div
              className={cn(
                // 1px gaps over bg-border draw the dividers at any column count.
                "grid gap-px overflow-hidden rounded-xl border bg-border",
                deal.finalPct > 0 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3",
              )}
            >
              <MoneyRow label={`${s.deal.deposit} (${deal.depositPct}%)`} amount={both(due.deposit, deal.currency, rate)} payment={latest(payments, "deposit")} s={s} />
              <MoneyRow
                label={s.deal.balance}
                amount={both(due.balance, deal.currency, rate)}
                payment={latest(payments, "balance")}
                s={s}
                note={due.balanceReduction > 0 ? `− ${both(due.balanceReduction, deal.currency, rate)} ${s.deal.agreedClaim}` : undefined}
              />
              {deal.finalPct > 0 && (
                <MoneyRow
                  label={`${s.deal.final} (${deal.finalPct}%)`}
                  amount={both(due.final, deal.currency, rate)}
                  payment={latest(payments, "final")}
                  s={s}
                  note={due.finalReduction > 0 ? `− ${both(due.finalReduction, deal.currency, rate)} ${s.deal.agreedClaim}` : undefined}
                />
              )}
              <div className="flex items-baseline justify-between gap-3 bg-background p-4 md:flex-col md:justify-start md:gap-0">
                <span className="text-sm text-muted-foreground">{s.deal.total}</span>
                <span className="font-medium">{both(deal.totalMinor, deal.currency, rate)}</span>
              </div>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {s.deal.kesEstimate.replace("{rate}", String(rate)).replace("{currency}", deal.currency)}
            </p>
          </section>

          {/* Quality terms, agreed before the deposit */}
          <section>
            <h2 className={sectionTitle}>{s.deal.qualityTerms}</h2>
            <QualityTerms deal={deal} s={s.deal} />
          </section>

          {/* Quality claim, when there is one */}
          {claims.map((cl) => (
            <section key={cl.id}>
              <h2 className={sectionTitle}>{s.deal.claim}</h2>
              <div className={cn("rounded-xl border p-4 md:p-5", cl.status === "open" && "border-2 border-red-500 bg-red-50/50 dark:bg-red-950/20")}>
                <p className="font-medium">
                  {s.claimsList.reason[cl.reason]} · {s.deal.asked} {both(cl.amountRequestedMinor, deal.currency, rate)} {s.deal.off}
                </p>
                <p className="mt-1 text-sm">&ldquo;{cl.description}&rdquo;</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.deal.actor.buyer} · {fmtTimeEAT(cl.createdAt)}
                  {cl.photoKeys.length > 0 && (
                    <>
                      {" · "}
                      <CameraIcon aria-hidden className="inline size-3.5" /> {cl.photoKeys.length}
                    </>
                  )}
                </p>
                <div className="mt-4">
                  <ClaimCheckCard check={claimCheckFor({ deal, claim: cl, readings, transitLog })} s={s.deal} currency={deal.currency} />
                </div>
                {cl.status !== "open" && (
                  <p className="mt-3 text-sm font-medium">
                    {s.deal.outcome}: {s.claimsList[cl.status]} · {fmt(cl.agreedAmountMinor ?? 0, deal.currency)} {s.deal.off}
                    {cl.responseNote && <span className="mt-1 block font-normal text-muted-foreground">&ldquo;{cl.responseNote}&rdquo;</span>}
                  </p>
                )}
              </div>
            </section>
          ))}

          {/* Readings: packhouse vs arrival */}
          {deal.proofLockedAt && (
            <section>
              <h2 className={sectionTitle}>{s.deal.readings}</h2>
              <ReadingsCompared readings={readings} minDryMatterPct={deal.minDryMatterPct} s={s.deal} />
            </section>
          )}

          {/* Transit log: attached once after dispatch */}
          {deal.proofLockedAt && deal.status !== "cancelled" && (
            <section>
              <h2 className={sectionTitle}>{s.deal.transit}</h2>
              {transitLog ? (
                <TransitSummary log={transitLog} deal={deal} s={s.deal} timeZone="Africa/Nairobi" downloadHref={`/deals/${deal.id}/transit`} />
              ) : (
                <TransitAttach dealId={deal.id} labels={{ attach: s.deal.attachTransit, sample: s.deal.useSample, hint: s.deal.transitHint }} />
              )}
            </section>
          )}

          {/* 4. Proof */}
          <section>
            <h2 className={sectionTitle}>{s.deal.proof}</h2>
            {deal.proofLockedAt && (
              <p className="mb-3 text-sm text-muted-foreground">{s.proof.locked.replace("{time}", fmtTimeEAT(deal.proofLockedAt))}</p>
            )}
            {proof.some((i) => i.sha256) ? (
              <ProofGallery items={proof} s={s.proof} fileUrl={(itemId) => `/deals/${deal.id}/files/${itemId}`} time="eat" />
            ) : (
              <p className="rounded-xl border p-4 text-sm text-muted-foreground">{s.deal.noProof}</p>
            )}
          </section>
        </div>

        {/* 5. Timeline — a side panel on large screens */}
        <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:rounded-xl lg:border lg:p-5">
          <h2 className={sectionTitle}>{s.deal.timeline}</h2>
          <Timeline events={events} actors={s.deal.actor} />
        </aside>
      </div>

      {/* 6. Overflow actions (phone; desktop shows them in the header) */}
      <div className="flex flex-col items-start pb-2 md:hidden">
        <Link href={`/deals/${deal.id}/bundle`} className="inline-flex h-11 items-center gap-2 text-sm text-primary underline-offset-4 hover:underline">
          <FileDownIcon className="size-4" />
          {s.deal.bundle}
        </Link>
        {deal.status === "awaiting_deposit" && (
          <form action={cancel}>
            <button className="h-11 text-sm text-destructive underline-offset-4 hover:underline">{s.deal.cancel}</button>
          </form>
        )}
      </div>

      {/* Phones: the same action pinned to the bottom (desktop shows it in the next-step card) */}
      {next.href && (
        <BottomBar desktop="hidden">
          <Link href={next.href} className={cn(buttonVariants(), primaryButton)}>
            {next.button}
          </Link>
        </BottomBar>
      )}
    </main>
  );
}

function nextStep(status: string, id: string, s: ReturnType<typeof t>) {
  switch (status) {
    case "awaiting_deposit":
      return { text: s.deal.waitingDeposit, button: s.deal.shareLink, href: `/deals/${id}/share` };
    case "deposit_paid":
      return { text: s.deal.depositReceived, button: s.deal.addProof, href: `/deals/${id}/proof` };
    case "claim_open":
      return { text: s.next.claim_open, button: s.deal.respond, href: `/deals/${id}/claim` };
    default:
      return { text: s.next[status as keyof typeof s.next], button: null, href: null };
  }
}

function latest(payments: Payment[], kind: Payment["kind"]) {
  const ofKind = payments.filter((p) => p.kind === kind);
  return ofKind.find((p) => p.status !== "pending") ?? ofKind.at(-1);
}

function MoneyRow({
  label,
  amount,
  payment,
  note,
  s,
}: {
  label: string;
  amount: string;
  payment?: Payment;
  note?: string;
  s: ReturnType<typeof t>;
}) {
  const paid = payment && payment.status !== "pending" && payment.paidAt;
  return (
    <div className="flex items-start justify-between gap-3 bg-background p-4 md:flex-col md:justify-start md:gap-1">
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-medium">{amount}</p>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
        {paid && payment.payazaReference && <p className="mt-0.5 font-mono text-xs text-muted-foreground">Payaza {payment.payazaReference}</p>}
      </div>
      <span className={cn("shrink-0 text-sm", paid ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
        {paid ? `${s.deal.paid} ${fmtDateEAT(payment.paidAt!)}` : s.deal.waiting}
      </span>
    </div>
  );
}
