import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireExporter } from "@/auth";
import { ProofGallery } from "@/components/proof-gallery";
import { ClaimCheckCard } from "@/components/quality";
import { claimCheckFor } from "@/lib/claim-check";
import { RELEVANT_PROOF } from "@/lib/claims";
import { amountsDue, fmtTimeEAT, loadDeal } from "@/lib/deals";
import { t } from "@/lib/i18n";
import { sectionTitle } from "@/lib/layout";
import { both, kesRate } from "@/lib/money";
import { RespondForm } from "./respond-form";

export default async function RespondToClaimPage({ params }: PageProps<"/deals/[id]/claim">) {
  const { id } = await params;
  const exporter = await requireExporter();
  const data = await loadDeal({ id, exporterId: exporter.id });
  if (!data) notFound();
  const { deal, claims, proof, readings, transitLog } = data;
  const claim = claims.find((c) => c.status === "open");
  if (!claim || deal.status !== "claim_open") redirect(`/deals/${id}`);

  const s = t(exporter.language);
  const r = s.respond;
  const rate = kesRate(deal.currency);
  // The claim holds one tranche: the balance, or the final payment if the balance was already paid.
  const due = amountsDue(deal);
  const trancheMinor = claim.appliesTo === "final" ? due.final : due.balance;
  const check = claimCheckFor({ deal, claim, readings, transitLog });

  // Most relevant proof first: for "immature", the dry-matter reading and its timestamp.
  const priority = RELEVANT_PROOF[claim.reason];
  const relevant = proof
    .filter((p) => priority.includes(p.type))
    .sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));
  const others = proof.filter((p) => !priority.includes(p.type));
  const fileUrl = (itemId: string) => `/deals/${id}/files/${itemId}`;

  return (
    <main className="flex w-full max-w-5xl flex-1 flex-col gap-5 md:gap-6">
      <Link href={`/deals/${id}`} className="-mt-2 -ml-1 flex h-11 w-fit items-center px-1 text-sm text-muted-foreground hover:text-foreground">
        ← {deal.number} · {deal.buyerCompany}
      </Link>
      <h1 className="-mt-3 text-2xl font-semibold md:text-3xl">{r.title}</h1>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-5 md:gap-6">
          <section>
            <h2 className={sectionTitle}>{s.deal.check}</h2>
            <p className="mb-3 text-sm text-muted-foreground">{s.deal.checkIntro}</p>
            <ClaimCheckCard check={check} s={s.deal} currency={deal.currency} />
          </section>

          {/* The buyer's claim, in their words */}
          <section className="rounded-xl border-2 border-red-500 bg-red-50/50 p-4 md:p-5 dark:bg-red-950/20">
            <h2 className={sectionTitle}>{r.theirClaim}</h2>
            <p className="text-lg font-semibold">{s.claimsList.reason[claim.reason]}</p>
            <blockquote className="mt-2 border-l-4 border-red-300 pl-3 text-base">&ldquo;{claim.description}&rdquo;</blockquote>
            <p className="mt-3 font-medium">
              {r.asks}: {both(claim.amountRequestedMinor, deal.currency, rate)}
            </p>
            <p className="text-sm text-muted-foreground">
              {r.filed} {fmtTimeEAT(claim.createdAt)}
            </p>
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">{r.photos}</p>
              {claim.photoKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">{r.noPhotos}</p>
              ) : (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {claim.photoKeys.map((_, n) => (
                    <li key={n}>
                      <a href={`/deals/${id}/claims/${claim.id}/${n}`} target="_blank" rel="noopener">
                        {/* eslint-disable-next-line @next/next/no-img-element -- private, access-checked route */}
                        <img src={`/deals/${id}/claims/${claim.id}/${n}`} alt="" className="aspect-square w-full rounded-lg border object-cover" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section>
            <h2 className={sectionTitle}>{r.relevant}</h2>
            {relevant.length > 0 ? (
              <ProofGallery items={relevant} s={s.proof} fileUrl={fileUrl} time="eat" />
            ) : (
              <p className="rounded-xl border p-4 text-sm text-muted-foreground">{s.deal.noProof}</p>
            )}
          </section>

          {others.length > 0 && (
            <details className="rounded-xl border p-4 md:p-5">
              <summary className="flex h-8 cursor-pointer items-center text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                {r.otherProof} · {others.length}
              </summary>
              <div className="mt-3">
                <ProofGallery items={others} s={s.proof} fileUrl={fileUrl} time="eat" />
              </div>
            </details>
          )}
        </div>

        <aside className="lg:sticky lg:top-8">
          <RespondForm
            dealId={id}
            s={r}
            currency={deal.currency}
            rate={rate}
            balanceMinor={trancheMinor}
            requestedMinor={claim.amountRequestedMinor}
            suggestedMinor={check.verdict === "supported" && check.agreedAdjustmentMinor < claim.amountRequestedMinor ? check.agreedAdjustmentMinor : null}
            trancheLabel={claim.appliesTo === "final" ? s.deal.final : s.deal.balance}
          />
        </aside>
      </div>
    </main>
  );
}
