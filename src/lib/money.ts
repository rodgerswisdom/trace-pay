// Currencies we offer buyers. Payaza's Payment Page accepts USD; EUR/GBP/AED availability on the
// sandbox is still to be confirmed with the Payaza mentors — remove any that checkout rejects.
export const CURRENCIES = ["USD", "EUR", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];

const FX_ENV: Record<Currency, string | undefined> = {
  USD: process.env.FX_USD_KES,
  EUR: process.env.FX_EUR_KES,
  GBP: process.env.FX_GBP_KES,
};
const FX_DEFAULT: Record<Currency, number> = { USD: 129.2, EUR: 144.5, GBP: 172.8 };

/** Indicative rate for "estimate" KES figures. Server-only (reads env). */
export function kesRate(currency: string): number {
  const c = currency as Currency;
  return Number(FX_ENV[c] ?? FX_DEFAULT[c] ?? 1);
}

export function toKesMinor(amountMinor: number, rate: number): number {
  return Math.round(amountMinor * rate);
}

export function fmt(amountMinor: number, currency: string): string {
  const major = amountMinor / 100;
  const whole = Number.isInteger(major);
  return `${currency} ${major.toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "KES 1.6M" style for summary cards; full figures elsewhere. */
export function fmtKesShort(kesMinor: number): string {
  const major = kesMinor / 100;
  if (major >= 1_000_000) return `KES ${(major / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  return fmt(kesMinor, "KES").replace(/\.\d+$/, "");
}

/** "USD 945 · KES 122,000" */
export function both(amountMinor: number, currency: string, rate: number): string {
  const kes = Math.round(toKesMinor(amountMinor, rate) / 100) * 100;
  return `${fmt(amountMinor, currency)} · ${fmt(kes, "KES")}`;
}

/** Deposit now, balance when proof locks, optional final tranche on arrival. */
export function splitTranches(totalMinor: number, depositPct: number, finalPct = 0) {
  const deposit = Math.round((totalMinor * depositPct) / 100);
  const final = Math.round((totalMinor * finalPct) / 100);
  return { deposit, balance: totalMinor - deposit - final, final };
}
