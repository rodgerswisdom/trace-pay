import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { DEAL_DOCUMENT_TYPES, dealDocuments, deals, type DealDocument } from "@/db/schema";
import { MAX_UPLOAD_BYTES } from "./proof";
import { deleteObject, getObject, putObject, safeName } from "./storage";

const DOCUMENT_TYPES = new Set(DEAL_DOCUMENT_TYPES);
const DOCUMENT_UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export class DealDocumentError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}

export async function exporterDealForDocuments(dealId: string) {
    const session = await auth();
    if (!session?.user?.id) throw new DealDocumentError("Sign in again", 401);
    const deal = await db.query.deals.findFirst({ where: and(eq(deals.id, dealId), eq(deals.exporterId, session.user.id)) });
    if (!deal) throw new DealDocumentError("Deal not found", 404);
    if (deal.status !== "awaiting_deposit") throw new DealDocumentError("Deal documents can only change before the deposit is paid", 409);
    return deal;
}

export async function listDealDocuments(dealId: string) {
    return db.select().from(dealDocuments).where(eq(dealDocuments.dealId, dealId)).orderBy(asc(dealDocuments.uploadedAt));
}

export async function addDealDocument(dealId: string, form: FormData) {
    await exporterDealForDocuments(dealId);
    const category = String(form.get("category") ?? "");
    if (!(DOCUMENT_TYPES as ReadonlySet<string>).has(category)) throw new DealDocumentError("Choose a document category");
    const documentCategory = category as (typeof DEAL_DOCUMENT_TYPES)[number];

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new DealDocumentError("No file received");
    if (file.size > MAX_UPLOAD_BYTES) throw new DealDocumentError("File is larger than 4 MB");
    const contentType = file.type || "application/octet-stream";
    if (!DOCUMENT_UPLOAD_TYPES.has(contentType)) throw new DealDocumentError("Upload a JPEG, PNG, WebP image or PDF");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const id = crypto.randomUUID();
    const fileKey = `deals/${dealId}/documents/${id}-${safeName(file.name)}`;
    await putObject(fileKey, bytes, contentType);

    try {
        const [item] = await db
            .insert(dealDocuments)
            .values({
                id,
                dealId,
                category: documentCategory,
                fileKey,
                fileName: file.name.slice(0, 200),
                contentType,
                sizeBytes: bytes.byteLength,
                sha256,
                uploadedAt: new Date(),
            })
            .returning();
        return item;
    } catch (error) {
        await deleteObject(fileKey);
        throw error;
    }
}

export async function removeDealDocument(dealId: string, documentId: string) {
    await exporterDealForDocuments(dealId);
    const [removed] = await db
        .delete(dealDocuments)
        .where(and(eq(dealDocuments.id, documentId), eq(dealDocuments.dealId, dealId)))
        .returning();
    if (!removed) throw new DealDocumentError("Document not found", 404);
    await deleteObject(removed.fileKey);
}

export async function lockDealDocuments(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], dealId: string, lockedAt: Date) {
    await tx.update(dealDocuments).set({ lockedAt }).where(and(eq(dealDocuments.dealId, dealId), isNull(dealDocuments.lockedAt)));
}

export async function documentFileResponse(item: DealDocument, download: boolean) {
    const bytes = await getObject(item.fileKey);
    if (!bytes) return new Response("File missing", { status: 404 });
    return new Response(new Uint8Array(bytes), {
        headers: {
            "Content-Type": item.contentType,
            "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${item.fileName.replace(/["\\\r\n]/g, "_")}"`,
            "Cache-Control": "private, max-age=600",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        },
    });
}

export async function buyerDocument(token: string, documentId: string) {
    const deal = await db.query.deals.findFirst({ where: eq(deals.buyerToken, token), columns: { id: true } });
    if (!deal) return null;
    return db.query.dealDocuments.findFirst({ where: and(eq(dealDocuments.id, documentId), eq(dealDocuments.dealId, deal.id)) });
}

export function dealDocumentErrorResponse(error: unknown) {
    if (error instanceof DealDocumentError) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
}
