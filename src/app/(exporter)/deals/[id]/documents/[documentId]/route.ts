import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { dealDocuments, deals } from "@/db/schema";
import { documentFileResponse } from "@/lib/deal-documents";

export async function GET(req: Request, { params }: RouteContext<"/deals/[id]/documents/[documentId]">) {
    const { id, documentId } = await params;
    const session = await auth();
    if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
    const own = await db.query.deals.findFirst({ where: and(eq(deals.id, id), eq(deals.exporterId, session.user.id)), columns: { id: true } });
    if (!own) return new Response("Not found", { status: 404 });
    const item = await db.query.dealDocuments.findFirst({ where: and(eq(dealDocuments.id, documentId), eq(dealDocuments.dealId, id)) });
    if (!item) return new Response("Not found", { status: 404 });
    return documentFileResponse(item, new URL(req.url).searchParams.has("download"));
}
