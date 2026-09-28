import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireExporter } from "@/auth";
import { amountsDue, loadDeal } from "@/lib/deals";
import { t } from "@/lib/i18n";
import { both, kesRate } from "@/lib/money";
import { db } from "@/db";
import { proofItems } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { ProofChecklist } from "./proof-checklist";

export default async function AddProofPage({ params, searchParams }: PageProps<"/deals/[id]/proof">) {
  const { id } = await params;
  const { error } = await searchParams;
  const exporter = await requireExporter();
  const data = await loadDeal({ id, exporterId: exporter.id });
  if (!data) notFound();
  const { deal } = data;
  if (deal.proofLockedAt || deal.status !== "deposit_paid") redirect(`/deals/${id}`);

  const s = t(exporter.language);
  const items = await db.select().from(proofItems).where(eq(proofItems.dealId, id)).orderBy(asc(proofItems.createdAt));
  const balance = both(amountsDue(deal).balance, deal.currency, kesRate(deal.currency));

  return (
    <main className="flex w-full max-w-3xl flex-1 flex-col gap-5">
      <Link href={`/deals/${id}`} className="-mt-2 -ml-1 flex h-11 w-fit items-center px-1 text-sm text-muted-foreground hover:text-foreground">
        ← {deal.number} · {deal.buyerCompany}
      </Link>
      <div className="-mt-3">
        <h1 className="text-2xl font-semibold md:text-3xl">{s.proof.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">{s.proof.intro}</p>
      </div>
      <ProofChecklist
        dealId={id}
        s={s.proof}
        balance={balance}
        showIncomplete={error === "incomplete"}
        initial={items
          .filter((i) => i.sha256 && i.receivedAt)
          .map((i) => ({
            id: i.id,
            type: i.type,
            fileName: i.fileName,
            contentType: i.contentType,
            value: i.value,
            issuer: i.issuer,
            receivedAt: i.receivedAt!.toISOString(),
          }))}
      />
    </main>
  );
}
