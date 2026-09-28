import { proofErrorResponse, removeProofItem } from "@/lib/proof-server";

export async function DELETE(_req: Request, { params }: RouteContext<"/api/deals/[id]/proof/[itemId]">) {
  const { id, itemId } = await params;
  try {
    await removeProofItem(id, itemId);
    return Response.json({ ok: true });
  } catch (e) {
    return proofErrorResponse(e);
  }
}
