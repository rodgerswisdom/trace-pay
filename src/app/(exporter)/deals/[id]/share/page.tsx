import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireExporter } from "@/auth";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { BottomBar, primaryButton } from "@/components/bottom-bar";
import { ShareLink } from "@/components/share-link";
import { buttonVariants } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { buyerLink } from "@/lib/urls";
import { cn } from "@/lib/utils";

export default async function SharePage({ params }: PageProps<"/deals/[id]/share">) {
  const { id } = await params;
  const exporter = await requireExporter();
  const deal = await db.query.deals.findFirst({ where: and(eq(deals.id, id), eq(deals.exporterId, exporter.id)) });
  if (!deal) notFound();
  const all = t(exporter.language);
  const s = all.share;
  const canAddProof = !deal.proofLockedAt && (deal.status === "awaiting_deposit" || deal.status === "deposit_paid");

  return (
    <main className="flex w-full max-w-4xl flex-1 flex-col gap-5 md:gap-8">
      <div>
        <p className="text-sm text-muted-foreground">{deal.number}</p>
        <h1 className="mt-1 text-2xl font-semibold md:text-3xl">
          {s.created} {deal.buyerContact} ({deal.buyerCompany}).
        </h1>
      </div>
      <ShareLink
        url={buyerLink(deal.buyerToken)}
        title={`${exporter.businessName} · ${deal.number}`}
        labels={{ copy: s.copy, copied: s.copied, share: s.share, qr: s.qr }}
      />
      <BottomBar className="md:max-w-xs">
        <Link href={`/deals/${deal.id}`} className={cn(buttonVariants({ variant: "secondary" }), primaryButton)}>
          {s.goToDeal}
        </Link>
        {canAddProof && (
          <Link href={`/deals/${deal.id}/proof`} className={cn(buttonVariants({ variant: "outline" }), primaryButton)}>
            {all.deal.addProofNow}
          </Link>
        )}
      </BottomBar>
    </main>
  );
}
