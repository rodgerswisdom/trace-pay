import { addDealDocument, dealDocumentErrorResponse } from "@/lib/deal-documents";

export async function POST(req: Request, { params }: RouteContext<"/api/deals/[id]/documents">) {
  const { id } = await params;
  try {
    const item = await addDealDocument(id, await req.formData());
    return Response.json({ item: { id: item.id, category: item.category, fileName: item.fileName, contentType: item.contentType, sizeBytes: item.sizeBytes, uploadedAt: item.uploadedAt.toISOString(), lockedAt: item.lockedAt?.toISOString() ?? null } });
  } catch (error) {
    return dealDocumentErrorResponse(error);
  }
}
