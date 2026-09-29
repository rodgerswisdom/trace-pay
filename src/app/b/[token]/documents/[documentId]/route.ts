import { buyerDocument, documentFileResponse } from "@/lib/deal-documents";

export async function GET(req: Request, { params }: RouteContext<"/b/[token]/documents/[documentId]">) {
    const { token, documentId } = await params;
    const item = await buyerDocument(token, documentId);
    if (!item) return new Response("Not found", { status: 404 });
    return documentFileResponse(item, new URL(req.url).searchParams.has("download"));
}
