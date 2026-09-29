import { dealDocumentErrorResponse, removeDealDocument } from "@/lib/deal-documents";

export async function DELETE(_req: Request, { params }: RouteContext<"/api/deals/[id]/documents/[documentId]">) {
    const { id, documentId } = await params;
    try {
        await removeDealDocument(id, documentId);
        return Response.json({ ok: true });
    } catch (error) {
        return dealDocumentErrorResponse(error);
    }
}
