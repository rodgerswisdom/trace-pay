import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileTextIcon } from "lucide-react";
import { requireExporter } from "@/auth";
import { ProofGallery } from "@/components/proof-gallery";
import { AdjustmentCheck, SourceTag } from "@/components/quality";
import { claimCheckFor } from "@/lib/claim-check";
import { RELEVANT_PROOF } from "@/lib/claims";
import { amountsDue, fmtTimeEAT, loadDeal } from "@/lib/deals";
import { t } from "@/lib/i18n";
import { sectionTitle } from "@/lib/layout";
import { both, kesRate } from "@/lib/money";
import { REASON_TERM, termName, termRequirements } from "@/lib/terms";
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
  // The request holds one payment: the balance, or the final payment if the balance was already paid.
  const due = amountsDue(deal);
  const trancheMinor = claim.appliesTo === "final" ? due.final : due.balance;
  const check = claimCheckFor({ deal, claim, readings, transitLog });
  const term = REASON_TERM[claim.reason];
  const requirementLabel = (id: string) =>
    term ? (termRequirements(term, claim.measuredBy ?? "buyer").find((x) => x.id === id)?.label ?? id) : id;
  const source = claim.measuredBy === "inspector" ? s.deal.sources.independent : s.deal.sources.buyer;

  // Most relevant proof first: for dry matter, the packhouse reading and its timestamp.
  const priority = RELEVANT_PROOF[claim.reason];
  const relevant = proof.filter((p) => priority.includes(p.type)).sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));
  const others = proof.filter((p) => !priority.includes(p.type));
  const fileUrl = (itemId: string) => `/deals/${id}/files/${itemId}`;
  const evidenceUrl = (n: number) => `/deals/${id}/claims/${claim.id}/${n}`;

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
            <AdjustmentCheck check={check} s={s.deal} currency={deal.currency} />
          </section>

          {/* The buyer's request */}
          <section className="rounded-xl border-2 border-amber-300 bg-amber-50/40 p-4 md:p-5 dark:border-amber-800 dark:bg-amber-950/20">
            <h2 className={sectionTitle}>{r.theirClaim}</h2>
            <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              {term ? termName(term) : s.claimsList.reason[claim.reason]}
              <SourceTag label={source} />
            </p>
            <p className="mt-2 text-base">{claim.description}</p>
            <p className="mt-3 font-medium">
              {r.asks}: {both(claim.amountRequestedMinor, deal.currency, rate)}
            </p>
            <p className="text-sm text-muted-foreground">
              {r.filed} {fmtTimeEAT(claim.createdAt)}
            </p>
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">{r.photos}</p>
              {claim.evidence.length === 0 && claim.photoKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">{r.noPhotos}</p>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {(claim.evidence.length ? claim.evidence : claim.photoKeys.map((key) => ({ requirement: "", key, contentType: "image/jpeg", fileName: "", receivedAt: "" }))).map((e, n) => (
                    <li key={e.key} className="overflow-hidden rounded-lg border">
                      <a href={evidenceUrl(n)} target="_blank" rel="noopener" className="block">
                        {e.contentType.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element -- private, access-checked route
                          <img src={evidenceUrl(n)} alt="" className="aspect-[4/3] w-full bg-muted object-cover" />
                        ) : (
                          <span className="flex aspect-[4/3] w-full items-center justify-center bg-muted text-muted-foreground">
                            <FileTextIcon className="size-8" />
                          </span>
                        )}
                      </a>
                      {e.requirement && <p className="p-2 text-xs font-medium">{requirementLabel(e.requirement)}</p>}
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
            suggestedMinor={null}
            trancheLabel={claim.appliesTo === "final" ? s.deal.final : s.deal.balance}
          />
        </aside>
      </div>
    </main>
  );
}
