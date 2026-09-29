"use server";

import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireExporter } from "@/auth";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { newBuyerToken, recordEvent } from "@/lib/deals";
import { addDealDocument } from "@/lib/deal-documents";
import { t } from "@/lib/i18n";
import { CURRENCIES, fmt, splitTranches } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";

export type NewDealState = { errors?: Partial<Record<string, string>>; values?: Record<string, string> };

export async function createDeal(_prev: NewDealState, formData: FormData): Promise<NewDealState> {
  const exporter = await requireExporter();
  const s = t(exporter.language).newDeal;
  const values = Object.fromEntries(
    [...formData].filter(([, value]) => typeof value === "string").map(([key, value]) => [key, String(value)]),
  ) as Record<string, string>;
  const documentCategories = formData.getAll("documentCategory").map(String);
  const documentFiles = formData.getAll("dealDocument").filter((value): value is File => value instanceof File && value.size > 0);

  const schema = z.object({
    buyerCompany: z.string().trim().min(1, s.errCompany),
    buyerContact: z.string().trim().min(1, s.errContact),
    buyerEmail: z.email(s.errEmail),
    buyerPhone: z.string().transform((v, ctx) => normalizePhone(v) ?? (ctx.addIssue({ code: "custom", message: s.errPhone }), z.NEVER)),
    product: z.string().trim().min(1),
    weightKg: z.coerce.number({ error: s.errWeight }).int(s.errWeight).positive(s.errWeight),
    destination: z.string().trim().min(1, s.errDestination),
    dispatchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, s.errDate),
    pricePerKg: z.coerce.number({ error: s.errPrice }).positive(s.errPrice),
    currency: z.enum(CURRENCIES),
    depositPct: z.coerce.number().int().min(10).max(90),
    finalPct: z.coerce.number().int().min(0).max(30),
    minDryMatterPct: z.coerce.number({ error: s.errDryMatter }).min(15, s.errDryMatter).max(40, s.errDryMatter),
    tempMinC: z.coerce.number({ error: s.errTemp }).min(-2, s.errTemp).max(20, s.errTemp),
    tempMaxC: z.coerce.number({ error: s.errTemp }).min(-2, s.errTemp).max(25, s.errTemp),
    breachAdjustPct: z.coerce.number({ error: s.errAdjust }).int(s.errAdjust).min(0, s.errAdjust).max(50, s.errAdjust),
  }).refine((v) => v.tempMaxC > v.tempMinC, { message: s.errTemp, path: ["tempMinC"] })
    .refine((v) => v.depositPct + v.finalPct < 100, { message: s.errWeight, path: ["finalPct"] });

  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors, values };
  }

  const requiredDocuments = ["quality_certificate", "origin_traceability"];
  if (!requiredDocuments.every((category) => documentCategories.includes(category))) return { errors: { documents: s.documentsRequired }, values };

  const v = parsed.data;
  const pricePerKgMinor = Math.round(v.pricePerKg * 100);
  const totalMinor = pricePerKgMinor * v.weightKg;
  const { deposit, balance, final } = splitTranches(totalMinor, v.depositPct, v.finalPct);

  const deal = await db.transaction(async (tx) => {
    // Deal numbers start at TP-0926 to match the pitch deck.
    const [{ next }] = await tx.select({ next: sql<number>`coalesce(max(${deals.seq}), 925) + 1` }).from(deals);
    const [d] = await tx
      .insert(deals)
      .values({
        seq: next,
        exporterId: exporter.id,
        buyerCompany: v.buyerCompany,
        buyerContact: v.buyerContact,
        buyerEmail: v.buyerEmail.toLowerCase(),
        buyerPhone: v.buyerPhone,
        product: v.product,
        weightKg: v.weightKg,
        pricePerKgMinor,
        currency: v.currency,
        totalMinor,
        depositPct: v.depositPct,
        finalPct: v.finalPct,
        minDryMatterPct: v.minDryMatterPct,
        tempMinC: v.tempMinC,
        tempMaxC: v.tempMaxC,
        breachAdjustPct: v.breachAdjustPct,
        destination: v.destination,
        dispatchDate: v.dispatchDate,
        buyerToken: newBuyerToken(),
      })
      .returning();
    await recordEvent(
      tx,
      d.id,
      "exporter",
      "deal_created",
      `Deal created · ${fmt(totalMinor, v.currency)} · deposit ${fmt(deposit, v.currency)} (${v.depositPct}%), balance ${fmt(balance, v.currency)} after proof${final ? `, final ${fmt(final, v.currency)} on arrival` : ""}`,
    );
    await recordEvent(
      tx,
      d.id,
      "exporter",
      "terms_set",
      `Quality terms agreed · dry matter at least ${v.minDryMatterPct}% · transit ${v.tempMinC}–${v.tempMaxC} °C · ${v.breachAdjustPct}% of deal value off per breached term`,
    );
    return d;
  });

  for (const [index, file] of documentFiles.entries()) {
    const documentForm = new FormData();
    documentForm.set("category", documentCategories[index] ?? "");
    documentForm.set("file", file, file.name);
    await addDealDocument(deal.id, documentForm);
  }

  redirect(`/deals/${deal.id}/documents`);
}
