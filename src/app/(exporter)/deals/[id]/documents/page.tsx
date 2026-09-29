import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireExporter } from "@/auth";
import { db } from "@/db";
import { dealDocuments, deals } from "@/db/schema";
import { t } from "@/lib/i18n";
import { and, asc, eq } from "drizzle-orm";
import { DocumentsUpload } from "./documents-upload";

export default async function DealDocumentsPage({ params }: PageProps<"/deals/[id]/documents">) {
  const { id } = await params;
  const exporter = await requireExporter();
  const deal = await db.query.deals.findFirst({ where: and(eq(deals.id, id), eq(deals.exporterId, exporter.id)) });
  if (!deal) notFound();
  if (deal.status !== "awaiting_deposit") redirect(`/deals/${id}`);
  const documents = await db.select().from(dealDocuments).where(eq(dealDocuments.dealId, id)).orderBy(asc(dealDocuments.uploadedAt));
  const s = t(exporter.language).documents;

  return (
    <main className="flex w-full max-w-3xl flex-1 flex-col gap-5">
      <Link href={`/deals/${id}`} className="-mt-2 -ml-1 flex h-11 w-fit items-center px-1 text-sm text-muted-foreground hover:text-foreground">← {deal.number}</Link>
      <div>
        <p className="text-sm text-muted-foreground">{deal.number} · {deal.buyerCompany}</p>
        <h1 className="mt-1 text-2xl font-semibold md:text-3xl">{s.title}</h1>
      </div>
      <DocumentsUpload dealId={id} s={s} initial={documents} locked={false} />
    </main>
  );
}
