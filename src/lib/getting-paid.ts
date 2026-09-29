import type { PayoutAccountType } from "@/db/schema";

// Shared by the server and the withdraw screens. Words on screen follow the design note: no "wallet",
// "sub-account", "settlement", "B2C" or "RTGS".

/** A new account can receive money this long after it was added. */
export const HOLD_HOURS = 24;
/** Withdrawals at or above this (in KES) need a second confirmation. */
export const LARGE_WITHDRAWAL_KES_MINOR = 1_000_000_00;
/** Safaricom's limit for a single payment to an M-Pesa number. */
export const MPESA_MAX_KES_MINOR = 250_000_00;

export type AccountTypeInfo = {
  type: PayoutAccountType;
  label: string;
  hint: string;
  /** Payaza can send to it today. */
  available: boolean;
};

export const ACCOUNT_TYPES: AccountTypeInfo[] = [
  { type: "bank", label: "Bank account", hint: "Kenyan bank, in shillings", available: true },
  { type: "mpesa_phone", label: "M-Pesa number", hint: "Up to KES 250,000 each time", available: true },
  { type: "mpesa_paybill", label: "M-Pesa Paybill", hint: "Not available yet", available: false },
  { type: "mpesa_till", label: "M-Pesa Till", hint: "Not available yet", available: false },
  { type: "usd_bank", label: "USD account", hint: "Not available yet", available: false },
];

// Kenyan bank codes (CBK). To confirm with Payaza: its bank-code list for KES isn't open to this account.
export const KENYAN_BANKS = [
  { code: "68", name: "Equity Bank" },
  { code: "01", name: "KCB Bank" },
  { code: "11", name: "Co-operative Bank" },
  { code: "07", name: "NCBA Bank" },
  { code: "03", name: "Absa Bank Kenya" },
  { code: "02", name: "Standard Chartered" },
  { code: "31", name: "Stanbic Bank" },
  { code: "63", name: "Diamond Trust Bank" },
  { code: "57", name: "I&M Bank" },
  { code: "70", name: "Family Bank" },
  { code: "12", name: "National Bank of Kenya" },
] as const;

/** A saved account as the browser sees it: never the full number. */
export type AccountView = {
  id: string;
  type: PayoutAccountType;
  provider: string;
  last4: string;
  accountName: string;
  isDefault: boolean;
  /** ISO. In the future while the account is on hold. */
  activeAt: string;
  /** Has had money sent to it before. */
  used: boolean;
};

export const maskedNumber = (a: Pick<AccountView, "last4">) => `•••• ${a.last4}`;

/** "Active in 23h" / "Active in 40 min" / null once active. */
export function holdLabel(activeAt: string | Date, now = Date.now()): string | null {
  const ms = new Date(activeAt).getTime() - now;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  return h >= 1 ? `Active in ${h}h` : `Active in ${Math.max(1, Math.ceil(ms / 60_000))} min`;
}

/** "0712 345 678" or "254712345678" → "254712345678"; null if not a Kenyan mobile number. */
export function normalizeKenyanMobile(input: string): string | null {
  const d = input.replace(/\D/g, "");
  const m = d.match(/^(?:254|0)?([17]\d{8})$/);
  return m ? `254${m[1]}` : null;
}

export type Quote = { sendMinor: number; rate: number; grossKesMinor: number; feeKesMinor: number; receiveKesMinor: number };

/** What the exporter receives in KES, rounded down to whole shillings. */
export function quote(amountMinor: number, currency: string, rate: number, feeKesMinor: number): Quote {
  const r = currency === "KES" ? 1 : rate;
  const gross = Math.floor((amountMinor * r) / 100) * 100;
  return { sendMinor: amountMinor, rate: r, grossKesMinor: gross, feeKesMinor, receiveKesMinor: Math.max(0, gross - feeKesMinor) };
}

export const WITHDRAWAL_STATUS_TEXT = {
  initiated: "Initiated",
  on_its_way: "On its way",
  received: "Received",
  failed: "Didn't go through",
} as const;

/** Expected arrival, in words, by account type. */
export const EXPECTED_TIME: Record<PayoutAccountType, string> = {
  mpesa_phone: "Usually within a few minutes",
  bank: "Usually the same working day",
  mpesa_paybill: "Usually within a few minutes",
  mpesa_till: "Usually within a few minutes",
  usd_bank: "Usually 1–2 working days",
};
