import { addProofItem, proofErrorResponse } from "@/lib/proof-server";

export async function POST(req: Request, { params }: RouteContext<"/api/deals/[id]/proof">) {
  const { id } = await params;
  try {
    const item = await addProofItem(id, await req.formData());
    return Response.json({
      item: {
        id: item.id,
        type: item.type,
        fileName: item.fileName,
        contentType: item.contentType,
        value: item.value,
        issuer: item.issuer,
        sha256: item.sha256,
        receivedAt: item.receivedAt?.toISOString(),
      },
    });
  } catch (e) {
    return proofErrorResponse(e);
  }
}
