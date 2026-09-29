"use server";

import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireExporter } from "@/auth";
import { db } from "@/db";
import { exporters, payoutAccounts, type PayoutAccountType } from "@/db/schema";
import { ACCOUNT_TYPES, HOLD_HOURS, KENYAN_BANKS, normalizeKenyanMobile } from "@/lib/getting-paid";
import { checkWithdrawal, createWithdrawal, issueCode, maskPhone, redeemCode } from "@/lib/payouts-server";

// Every change to where money goes needs the password and a one-time code. The action is stored with the
// code, so what the exporter confirmed is exactly what happens.

export type Challenge = { ok: true; challengeId: string; demoCode: string; sentTo: string } | { ok: false; error: string };

export type AccountChange =
  | { op: "add"; type: PayoutAccountType; bankCode?: string; accountNumber: string; accountName: string }
  | { op: "remove"; accountId: string }
  | { op: "default"; accountId: string }
  | { op: "unfreeze" };

const PURPOSE = { add: "add_account", remove: "remove_account", default: "default_account", unfreeze: "unfreeze" } as const;

function validateAdd(c: Extract<AccountChange, { op: "add" }>) {
  const info = ACCOUNT_TYPES.find((t) => t.type === c.type);
  if (!info?.available) return { error: "We can't send to this kind of account yet." };
  const name = c.accountName.trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 80) return { error: "Enter the name exactly as it appears on the account." };
  if (c.type === "mpesa_phone") {
    const phone = normalizeKenyanMobile(c.accountNumber);
    if (!phone) return { error: "Enter a Safaricom number, like 0712 345 678." };
    return { value: { type: c.type, provider: "M-Pesa", bankCode: null, accountNumber: phone, accountName: name } };
  }
  const bank = KENYAN_BANKS.find((b) => b.code === c.bankCode);
  if (!bank) return { error: "Choose your bank." };
  const number = c.accountNumber.replace(/[\s-]/g, "");
  if (!/^\d{6,16}$/.test(number)) return { error: "Enter the account number, digits only." };
  return { value: { type: c.type, provider: bank.name, bankCode: bank.code, accountNumber: number, accountName: name } };
}

export async function startAccountChange(change: AccountChange, password: string): Promise<Challenge> {
  const exporter = await requireExporter();
  let payload: Record<string, unknown> = { op: change.op };
  if (change.op === "add") {
    const v = validateAdd(change);
    if ("error" in v) return { ok: false, error: v.error! };
    payload = { op: "add", ...v.value };
  } else if (change.op === "remove" || change.op === "default") {
    const a = await db.query.payoutAccounts.findFirst({
      where: and(eq(payoutAccounts.id, change.accountId), eq(payoutAccounts.exporterId, exporter.id), isNull(payoutAccounts.removedAt)),
    });
    if (!a) return { ok: false, error: "That account isn't on your list any more." };
    payload = { op: change.op, accountId: a.id };
  }
  if (!(await bcrypt.compare(password, exporter.passwordHash))) return { ok: false, error: "That password isn't right." };
  const { challengeId, demoCode } = await issueCode(exporter.id, PURPOSE[change.op], payload);
  return { ok: true, challengeId, demoCode, sentTo: maskPhone(exporter.phone) };
}

export type ChangeResult = { ok: true; activeAt?: string; email: string } | { ok: false; error: string };

export async function confirmAccountChange(op: AccountChange["op"], challengeId: string, code: string): Promise<ChangeResult> {
  const exporter = await requireExporter();
  const check = await redeemCode(exporter.id, challengeId, PURPOSE[op], code);
  if (!check.ok) return check;
  const p = check.payload as { op: AccountChange["op"]; accountId?: string } & Record<string, string>;
  let activeAt: Date | undefined;

  await db.transaction(async (tx) => {
    if (p.op === "add") {
      const existing = await tx.query.payoutAccounts.findFirst({
        where: and(eq(payoutAccounts.exporterId, exporter.id), isNull(payoutAccounts.removedAt), eq(payoutAccounts.isDefault, true)),
      });
      activeAt = new Date(Date.now() + HOLD_HOURS * 3_600_000);
      await tx.insert(payoutAccounts).values({
        exporterId: exporter.id,
        type: p.type as PayoutAccountType,
        provider: p.provider,
        bankCode: p.bankCode || null,
        accountNumber: p.accountNumber,
        last4: p.accountNumber.slice(-4),
        accountName: p.accountName,
        isDefault: !existing,
        activeAt,
      });
    } else if (p.op === "remove") {
      await tx.update(payoutAccounts).set({ removedAt: new Date(), isDefault: false }).where(and(eq(payoutAccounts.id, p.accountId!), eq(payoutAccounts.exporterId, exporter.id)));
      // Another account becomes the default, oldest first.
      const next = await tx.query.payoutAccounts.findFirst({
        where: and(eq(payoutAccounts.exporterId, exporter.id), isNull(payoutAccounts.removedAt)),
        orderBy: payoutAccounts.createdAt,
      });
      const hasDefault = await tx.query.payoutAccounts.findFirst({
        where: and(eq(payoutAccounts.exporterId, exporter.id), isNull(payoutAccounts.removedAt), eq(payoutAccounts.isDefault, true)),
      });
      if (next && !hasDefault) await tx.update(payoutAccounts).set({ isDefault: true }).where(eq(payoutAccounts.id, next.id));
    } else if (p.op === "default") {
      await tx.update(payoutAccounts).set({ isDefault: false }).where(and(eq(payoutAccounts.exporterId, exporter.id), eq(payoutAccounts.isDefault, true)));
      await tx.update(payoutAccounts).set({ isDefault: true }).where(and(eq(payoutAccounts.id, p.accountId!), eq(payoutAccounts.exporterId, exporter.id)));
    } else if (p.op === "unfreeze") {
      await tx.update(exporters).set({ withdrawalsFrozenAt: null }).where(eq(exporters.id, exporter.id));
    }
  });

  revalidatePath("/", "layout");
  return { ok: true, activeAt: activeAt?.toISOString(), email: exporter.email };
}

/** Freezing needs no code: it only ever stops money leaving. */
export async function freezeWithdrawals() {
  const exporter = await requireExporter();
  if (!exporter.withdrawalsFrozenAt) await db.update(exporters).set({ withdrawalsFrozenAt: new Date() }).where(eq(exporters.id, exporter.id));
  revalidatePath("/", "layout");
}

export type WithdrawInput = { currency: string; amountMinor: number; accountId: string };
export type WithdrawChallenge =
  | { ok: true; challengeId: string; demoCode: string; sentTo: string; needsSecond: boolean }
  | { ok: false; error: string };

export async function startWithdrawal(input: WithdrawInput): Promise<WithdrawChallenge> {
  const exporter = await requireExporter();
  const check = await checkWithdrawal(exporter, input);
  if (!check.ok) return check;
  const { challengeId, demoCode } = await issueCode(exporter.id, "withdraw", { ...input, needsSecond: check.needsSecond, last4: check.account.last4 });
  return { ok: true, challengeId, demoCode, sentTo: maskPhone(exporter.phone), needsSecond: check.needsSecond };
}

export async function confirmWithdrawal(
  challengeId: string,
  code: string,
  secondCheck: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const exporter = await requireExporter();
  const check = await redeemCode(exporter.id, challengeId, "withdraw", code);
  if (!check.ok) return check;
  const p = check.payload as WithdrawInput & { needsSecond: boolean; last4: string };
  if (p.needsSecond && secondCheck.replace(/\D/g, "") !== p.last4) {
    return { ok: false, error: "The last 4 digits don't match that account. Start again." };
  }
  const result = await createWithdrawal(exporter.id, { currency: p.currency, amountMinor: p.amountMinor, accountId: p.accountId });
  revalidatePath("/", "layout");
  return result.ok ? { ok: true, id: result.id } : { ok: false, error: result.error };
}
