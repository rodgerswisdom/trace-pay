"use server";

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireExporter } from "@/auth";
import { db } from "@/db";
import { deals, proofItems } from "@/db/schema";
import { amountsDue, recordEvent } from "@/lib/deals";
import { both, kesRate } from "@/lib/money";
import { missingRequired } from "@/lib/proof";

/**
 * "Attach proof and request balance": lock the proof (no item can be added, changed or removed
 * after this — the database enforces it too) and ask the buyer for the balance.
 */
export async function lockProof(dealId: string) {
  const exporter = await requireExporter();

  const result = await db.transaction(async (tx) => {
    const [deal] = await tx
      .select()
      .from(deals)
      .where(and(eq(deals.id, dealId), eq(deals.exporterId, exporter.id)));
    if (!deal) return "not_found" as const;
    if (deal.proofLockedAt || deal.status !== "deposit_paid") return "already" as const;

    const items = await tx
      .select({ type: proofItems.type, sha256: proofItems.sha256 })
      .from(proofItems)
      .where(and(eq(proofItems.dealId, dealId), isNotNull(proofItems.sha256)));
    if (missingRequired(items).length > 0) return "incomplete" as const;

    const [locked] = await tx
      .update(deals)
      .set({ proofLockedAt: new Date(), status: "proof_attached" })
      .where(and(eq(deals.id, dealId), eq(deals.status, "deposit_paid"), isNull(deals.proofLockedAt)))
      .returning();
    if (!locked) return "already" as const;

    const { balance } = amountsDue(deal);
    const amount = both(balance, deal.currency, kesRate(deal.currency));
    await recordEvent(tx, dealId, "exporter", "proof_attached", `Proof of dispatch attached · ${items.length} files, each fingerprinted and time-stamped`);
    await recordEvent(tx, dealId, "system", "balance_requested", `Balance requested from buyer · ${amount}`);
    return "ok" as const;
  });

  if (result === "incomplete") redirect(`/deals/${dealId}/proof?error=incomplete`);
  redirect(`/deals/${dealId}`);
}
