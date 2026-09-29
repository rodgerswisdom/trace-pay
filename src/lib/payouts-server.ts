import "server-only";
import { createHash, randomInt } from "node:crypto";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { confirmations, deals, exporters, payments, payoutAccounts, withdrawals, type Exporter, type PayoutAccount, type Withdrawal } from "@/db/schema";
import { type AccountView, MPESA_MAX_KES_MINOR, LARGE_WITHDRAWAL_KES_MINOR, quote, type Quote } from "./getting-paid";
import { kesRate } from "./money";
import { payoutsConfigured, queryPayout, sendPayout } from "./payaza";

// Getting paid: the exporter's balance, their payout accounts, codes for changes, and withdrawals.
// Balance per currency = what buyers paid on their deals − withdrawals that haven't failed.

export type Balance = { currency: string; availableMinor: number; rate: number };

export async function loadBalances(exporterId: string, exec: Pick<typeof db, "select"> = db): Promise<Balance[]> {
  const [paid, out] = await Promise.all([
    exec
      .select({ currency: payments.currency, n: sql<string>`sum(${payments.amountMinor})` })
      .from(payments)
      .innerJoin(deals, eq(payments.dealId, deals.id))
      .where(and(eq(deals.exporterId, exporterId), inArray(payments.status, ["paid", "settled"])))
      .groupBy(payments.currency),
    exec
      .select({ currency: withdrawals.currency, n: sql<string>`sum(${withdrawals.amountMinor})` })
      .from(withdrawals)
      .where(and(eq(withdrawals.exporterId, exporterId), ne(withdrawals.status, "failed")))
      .groupBy(withdrawals.currency),
  ]);
  return paid
    .map((p) => ({
      currency: p.currency,
      availableMinor: Number(p.n) - Number(out.find((o) => o.currency === p.currency)?.n ?? 0),
      rate: kesRate(p.currency),
    }))
    .sort((a, b) => b.availableMinor * b.rate - a.availableMinor * a.rate);
}

/** Flat transfer fee in KES, shown before the exporter confirms. */
export const feeKesMinor = () => Math.round(Number(process.env.PAYOUT_FEE_KES ?? 50) * 100);

/**
 * How withdrawals go out right now: real Payaza transfers, a clearly labelled practice run (no money moves;
 * only when PAYOUT_PRACTICE=1 and Payaza payouts aren't set up), or paused.
 */
export function payoutMode(): "live" | "practice" | "paused" {
  if (payoutsConfigured()) return "live";
  return process.env.PAYOUT_PRACTICE === "1" ? "practice" : "paused";
}

export async function loadAccounts(exporterId: string): Promise<PayoutAccount[]> {
  return db.query.payoutAccounts.findMany({
    where: and(eq(payoutAccounts.exporterId, exporterId), isNull(payoutAccounts.removedAt)),
    orderBy: [desc(payoutAccounts.isDefault), payoutAccounts.createdAt],
  });
}

export async function accountViews(exporterId: string): Promise<AccountView[]> {
  const [accounts, used] = await Promise.all([
    loadAccounts(exporterId),
    db
      .selectDistinct({ id: withdrawals.payoutAccountId })
      .from(withdrawals)
      .where(and(eq(withdrawals.exporterId, exporterId), eq(withdrawals.status, "received"))),
  ]);
  return accounts.map((a) => ({
    id: a.id,
    type: a.type,
    provider: a.provider,
    last4: a.last4,
    accountName: a.accountName,
    isDefault: a.isDefault,
    activeAt: a.activeAt.toISOString(),
    used: used.some((u) => u.id === a.id),
  }));
}

export async function loadWithdrawals(exporterId: string, limit = 100) {
  return db.query.withdrawals.findMany({
    where: eq(withdrawals.exporterId, exporterId),
    orderBy: desc(withdrawals.createdAt),
    with: { account: true },
    limit,
  });
}

// ---- One-time codes --------------------------------------------------------------------------
// No SMS provider is connected yet, so the code is shown on screen, marked as a demo.

type Purpose = (typeof confirmations.$inferSelect)["purpose"];
const hashCode = (id: string, code: string) => createHash("sha256").update(`${id}:${code}`).digest("hex");

export async function issueCode(exporterId: string, purpose: Purpose, payload: Record<string, unknown>) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const id = crypto.randomUUID();
  await db.insert(confirmations).values({
    id,
    exporterId,
    purpose,
    payload,
    codeHash: hashCode(id, code),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  return { challengeId: id, demoCode: code };
}

export type CodeCheck = { ok: true; payload: Record<string, unknown> } | { ok: false; error: string };

/** Checks and uses up a code. Five wrong tries or ten minutes and it's gone. */
export async function redeemCode(exporterId: string, challengeId: string, purpose: Purpose, code: string): Promise<CodeCheck> {
  const c = await db.query.confirmations.findFirst({
    where: and(eq(confirmations.id, challengeId), eq(confirmations.exporterId, exporterId), eq(confirmations.purpose, purpose)),
  });
  if (!c || c.usedAt) return { ok: false, error: "This code has already been used. Start again." };
  if (c.expiresAt < new Date() || c.attempts >= 5) return { ok: false, error: "This code has expired. Start again for a new one." };
  if (hashCode(c.id, code.replace(/\D/g, "")) !== c.codeHash) {
    await db.update(confirmations).set({ attempts: c.attempts + 1 }).where(eq(confirmations.id, c.id));
    return { ok: false, error: c.attempts >= 4 ? "Too many wrong codes. Start again for a new one." : "That code isn't right. Check the message and try again." };
  }
  const [used] = await db
    .update(confirmations)
    .set({ usedAt: new Date() })
    .where(and(eq(confirmations.id, c.id), isNull(confirmations.usedAt)))
    .returning();
  if (!used) return { ok: false, error: "This code has already been used. Start again." };
  return { ok: true, payload: c.payload };
}

export const maskPhone = (phone: string | null) => {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 3 ? `your phone ending ${d.slice(-3)}` : "your phone";
};

// ---- Withdrawals -----------------------------------------------------------------------------

export type WithdrawalCheck =
  | { ok: true; account: PayoutAccount; quote: Quote; needsSecond: boolean }
  | { ok: false; error: string };

/** Everything that must hold before money leaves: used both before the code is sent and again after. */
export async function checkWithdrawal(
  exporter: Exporter,
  input: { currency: string; amountMinor: number; accountId: string },
  balances?: Balance[],
): Promise<WithdrawalCheck> {
  if (exporter.withdrawalsFrozenAt) return { ok: false, error: "Withdrawals are frozen on your account. Unfreeze them in Settings first." };
  if (payoutMode() === "paused") return { ok: false, error: "Withdrawals are paused right now. Your balance is safe; try again later." };
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) return { ok: false, error: "Enter an amount to withdraw." };

  const account = await db.query.payoutAccounts.findFirst({
    where: and(eq(payoutAccounts.id, input.accountId), eq(payoutAccounts.exporterId, exporter.id), isNull(payoutAccounts.removedAt)),
  });
  if (!account) return { ok: false, error: "Choose where the money should go." };
  if (account.activeAt > new Date()) return { ok: false, error: "This account was added recently. It can receive money 24 hours after it was added." };
  if (account.type !== "bank" && account.type !== "mpesa_phone") return { ok: false, error: "We can't send to this kind of account yet." };

  const bal = (balances ?? (await loadBalances(exporter.id))).find((b) => b.currency === input.currency);
  if (!bal || bal.availableMinor < input.amountMinor) return { ok: false, error: "That's more than your balance." };

  const q = quote(input.amountMinor, input.currency, bal.rate, feeKesMinor());
  if (q.receiveKesMinor < 100_00) return { ok: false, error: "The smallest withdrawal is KES 100 after the fee." };
  if (account.type === "mpesa_phone" && q.receiveKesMinor > MPESA_MAX_KES_MINOR) {
    return { ok: false, error: "M-Pesa takes up to KES 250,000 at a time. Withdraw less, or choose a bank account." };
  }

  const firstToAccount = !(await db.query.withdrawals.findFirst({
    where: and(eq(withdrawals.payoutAccountId, account.id), eq(withdrawals.status, "received")),
  }));
  return { ok: true, account, quote: q, needsSecond: firstToAccount || q.grossKesMinor >= LARGE_WITHDRAWAL_KES_MINOR };
}

const newReference = () => `TPW${Date.now().toString(36).toUpperCase()}${randomInt(1000, 9999)}`;

/** Records the withdrawal (taking it off the balance), then hands it to Payaza. Returns the withdrawal id. */
export async function createWithdrawal(exporterId: string, input: { currency: string; amountMinor: number; accountId: string }) {
  const created = await db.transaction(async (tx) => {
    // One withdrawal at a time per exporter, so two taps can't both spend the same balance.
    const [exporter] = await tx.select().from(exporters).where(eq(exporters.id, exporterId)).for("update");
    const check = await checkWithdrawal(exporter, input, await loadBalances(exporterId, tx));
    if (!check.ok) return check;
    const [w] = await tx
      .insert(withdrawals)
      .values({
        exporterId,
        payoutAccountId: check.account.id,
        amountMinor: input.amountMinor,
        currency: input.currency,
        fxRate: check.quote.rate,
        feeMinor: check.quote.feeKesMinor,
        receiveMinor: check.quote.receiveKesMinor,
        reference: newReference(),
        practice: payoutMode() === "practice",
      })
      .returning();
    return { ok: true as const, withdrawal: w, account: check.account, exporter };
  });
  if (!created.ok) return created;

  const { withdrawal: w, account, exporter } = created;
  if (w.practice) {
    await db.update(withdrawals).set({ status: "on_its_way", sentAt: new Date() }).where(eq(withdrawals.id, w.id));
    return { ok: true as const, id: w.id };
  }

  const sent = await sendPayout({
    rail: account.type === "mpesa_phone" ? "mobile_money" : "kepss",
    amountMajor: w.receiveMinor / 100,
    accountNumber: account.accountNumber,
    accountName: account.accountName,
    bankCode: account.type === "mpesa_phone" ? (process.env.PAYAZA_MPESA_BANK_CODE ?? "MPESA") : (account.bankCode ?? ""),
    reference: w.reference,
    narration: `TRACE Pay ${w.reference.slice(-8)}`,
    sender: { name: exporter.businessName, phone: exporter.phone ?? "", address: "Kenya" },
  });
  if (sent.ok) {
    await db.update(withdrawals).set({ status: "on_its_way", sentAt: new Date() }).where(eq(withdrawals.id, w.id));
  } else {
    console.error("Payaza payout rejected", { ref: w.reference, raw: sent.raw });
    await db
      .update(withdrawals)
      .set({ status: "failed", failedAt: new Date(), failureReason: sent.retryable ? "Payaza couldn't be reached." : sent.reason })
      .where(eq(withdrawals.id, w.id));
  }
  return { ok: true as const, id: w.id };
}

const lastChecked = new Map<string, number>();

/** Moves a withdrawal forward from Payaza's side. Safe to call often; checks Payaza at most every 5s. */
export async function refreshWithdrawal(w: Withdrawal, hint?: "success" | "failed"): Promise<Withdrawal> {
  if (w.status === "received" || w.status === "failed") return w;

  if (w.practice) {
    // Practice run: no money moves. It "arrives" a few seconds after it was sent, so the tracker can be shown.
    if (w.sentAt && Date.now() - w.sentAt.getTime() > 8000) return markReceived(w, `PRACTICE-${w.reference.slice(-6)}`);
    return w;
  }

  const now = Date.now();
  if (!hint && now - (lastChecked.get(w.id) ?? 0) < 5000) return w;
  lastChecked.set(w.id, now);
  const q = await queryPayout(w.reference).catch(() => null);
  const status = q && q.status !== "unknown" ? q.status : hint;
  if (status === "success") return markReceived(w, q?.payazaReference ?? null);
  if (status === "failed") {
    const [u] = await db
      .update(withdrawals)
      .set({ status: "failed", failedAt: new Date(), failureReason: q?.message ?? "The bank or M-Pesa turned it down." })
      .where(and(eq(withdrawals.id, w.id), inArray(withdrawals.status, ["initiated", "on_its_way"])))
      .returning();
    return u ?? w;
  }
  return w;
}

async function markReceived(w: Withdrawal, payazaReference: string | null) {
  const [u] = await db
    .update(withdrawals)
    .set({ status: "received", receivedAt: new Date(), payazaReference: payazaReference ?? w.payazaReference })
    .where(and(eq(withdrawals.id, w.id), inArray(withdrawals.status, ["initiated", "on_its_way"])))
    .returning();
  return u ?? w;
}
