"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DeleteIcon, PlusIcon } from "lucide-react";
import { primaryButton } from "@/components/bottom-bar";
import { FlowHeader } from "@/components/flow-header";
import { AccountSummary, DemoCodeNote } from "@/components/getting-paid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXPECTED_TIME, MPESA_MAX_KES_MINOR, holdLabel, maskedNumber, quote, type AccountView } from "@/lib/getting-paid";
import { fmt } from "@/lib/money";
import { cn } from "@/lib/utils";
import { confirmWithdrawal, startWithdrawal } from "../getting-paid-actions";

const STEPS = ["Amount", "Where to", "Convert", "Confirm"] as const;

type Balance = { currency: string; availableMinor: number; rate: number };

/** "1234.5" → 123450 minor units; null if not a valid amount. */
const toMinor = (s: string) => (s && /^\d+(\.\d{0,2})?$/.test(s) ? Math.round(Number(s) * 100) : null);
const major = (minor: number) => (minor / 100).toFixed(2).replace(/\.00$/, "");

export function WithdrawFlow({
  balances,
  accounts,
  feeKesMinor,
  practice,
}: {
  balances: Balance[];
  accounts: AccountView[];
  feeKesMinor: number;
  practice: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [currency, setCurrency] = useState(balances[0].currency);
  const [entry, setEntry] = useState("");
  const [now] = useState(() => Date.now());
  const usable = (a: AccountView) => !holdLabel(a.activeAt, now) && (a.type === "bank" || a.type === "mpesa_phone");
  const [accountId, setAccountId] = useState<string | null>(() => (accounts.find((a) => a.isDefault && usable(a)) ?? accounts.find(usable))?.id ?? null);
  const [challenge, setChallenge] = useState<{ id: string; demoCode: string; sentTo: string; needsSecond: boolean } | null>(null);
  const [code, setCode] = useState("");
  const [second, setSecond] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const balance = balances.find((b) => b.currency === currency)!;
  const amountMinor = toMinor(entry);
  const tooMuch = amountMinor != null && amountMinor > balance.availableMinor;
  const account = accounts.find((a) => a.id === accountId) ?? null;
  const q = useMemo(() => (amountMinor ? quote(amountMinor, currency, balance.rate, feeKesMinor) : null), [amountMinor, currency, balance.rate, feeKesMinor]);
  const overMpesa = account?.type === "mpesa_phone" && q != null && q.receiveKesMinor > MPESA_MAX_KES_MINOR;
  const tooSmall = q != null && q.receiveKesMinor < 100_00;

  const press = (k: string) => {
    setError(null);
    setEntry((e) => {
      if (k === "del") return e.slice(0, -1);
      if (k === ".") return e.includes(".") ? e : (e || "0") + ".";
      const next = e === "0" ? k : e + k;
      return /^\d{0,9}(\.\d{0,2})?$/.test(next) ? next : e;
    });
  };

  // A keyboard works too, on a computer.
  useEffect(() => {
    if (step !== 0) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement) return;
      if (/^[0-9.]$/.test(ev.key)) press(ev.key);
      else if (ev.key === "Backspace") press("del");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const back = () => {
    setError(null);
    if (step === 3 && challenge) return setChallenge(null);
    setStep(step - 1);
  };

  const sendCode = () =>
    startTransition(async () => {
      setError(null);
      const r = await startWithdrawal({ currency, amountMinor: amountMinor!, accountId: accountId! });
      if (!r.ok) return setError(r.error);
      setChallenge({ id: r.challengeId, demoCode: r.demoCode, sentTo: r.sentTo, needsSecond: r.needsSecond });
      setCode("");
      setSecond("");
    });

  const confirm = () =>
    startTransition(async () => {
      setError(null);
      const r = await confirmWithdrawal(challenge!.id, code, second);
      if (!r.ok) {
        setError(r.error);
        if (/Start again/.test(r.error)) setChallenge(null);
        return;
      }
      router.push(`/withdrawals/${r.id}?new=1`);
    });

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <FlowHeader title="Withdraw" steps={STEPS} step={step} backHref="/home" onBack={step > 0 ? back : undefined} />
      {practice && (
        <p className="rounded-lg border border-dashed p-3 text-sm">
          <span className="font-medium">Practice mode.</span> Payaza payouts aren&apos;t switched on yet, so no money moves.
        </p>
      )}

      {step === 0 && (
        <section className="flex flex-col gap-4">
          {balances.length > 1 && (
            <div role="radiogroup" aria-label="Currency" className="grid grid-flow-col gap-2">
              {balances.map((b) => (
                <button
                  key={b.currency}
                  type="button"
                  role="radio"
                  aria-checked={b.currency === currency}
                  onClick={() => {
                    setCurrency(b.currency);
                    setEntry("");
                  }}
                  className={cn("h-12 rounded-lg border text-base font-medium", b.currency === currency ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted/50")}
                >
                  {b.currency}
                </button>
              ))}
            </div>
          )}
          <div className="rounded-xl border p-4 text-center">
            <p className="text-sm text-muted-foreground">How much?</p>
            <p aria-live="polite" className={cn("mt-1 text-4xl font-semibold tabular-nums", !entry && "text-muted-foreground", tooMuch && "text-red-700 dark:text-red-400")}>
              <span className="mr-1 text-xl align-middle">{currency}</span>
              {entry || "0"}
            </p>
            <p className={cn("mt-2 text-sm", tooMuch ? "font-medium text-red-700 dark:text-red-400" : "text-muted-foreground")}>
              {tooMuch ? "That's more than your balance. " : ""}Balance {fmt(balance.availableMinor, currency)}
            </p>
            <button type="button" onClick={() => setEntry(major(balance.availableMinor))} className="mt-1 h-11 px-3 text-sm font-medium text-primary underline-offset-4 hover:underline">
              Withdraw all
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2" aria-label="Number pad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => press(k)}
                aria-label={k === "del" ? "Delete" : k === "." ? "Decimal point" : k}
                className="flex h-14 items-center justify-center rounded-xl bg-muted/60 text-2xl font-medium tabular-nums transition-colors hover:bg-muted active:bg-muted"
              >
                {k === "del" ? <DeleteIcon aria-hidden className="size-6" /> : k}
              </button>
            ))}
          </div>
          <Button className={primaryButton} disabled={!amountMinor || tooMuch} onClick={() => setStep(1)}>
            Continue
          </Button>
        </section>
      )}

      {step === 1 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Where to?</h2>
          <div role="radiogroup" aria-label="Account" className="flex flex-col gap-2">
            {accounts.map((a) => {
              const ok = usable(a);
              return (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={a.id === accountId}
                  disabled={!ok}
                  onClick={() => setAccountId(a.id)}
                  className={cn(
                    "flex min-h-16 items-center rounded-xl border p-3 text-left transition-colors",
                    ok ? "hover:bg-muted/50" : "cursor-not-allowed",
                    a.id === accountId && "border-primary ring-2 ring-primary/30",
                  )}
                >
                  <AccountSummary account={a} now={now} dim={!ok} />
                </button>
              );
            })}
          </div>
          {accounts.some((a) => !usable(a)) && <p className="text-sm text-muted-foreground">Greyed-out accounts were added less than 24 hours ago.</p>}
          <Link href="/account/payouts/new?next=withdraw" className="inline-flex h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
            <PlusIcon aria-hidden className="size-4" />
            Add another account
          </Link>
          <Button className={primaryButton} disabled={!account || !usable(account)} onClick={() => setStep(2)}>
            Continue
          </Button>
        </section>
      )}

      {step === 2 && q && account && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Convert or keep?</h2>
          <div role="radiogroup" aria-label="Currency to receive" className="flex flex-col gap-2">
            <div role="radio" aria-checked className="rounded-xl border border-primary p-4 ring-2 ring-primary/30">
              <p className="font-medium">Convert to KES</p>
              <dl className="mt-3 flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">You send</dt>
                  <dd className="tabular-nums">{fmt(q.sendMinor, currency)}</dd>
                </div>
                {currency !== "KES" && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Rate</dt>
                    <dd className="tabular-nums">
                      1 {currency} = KES {q.rate.toFixed(2)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Fee</dt>
                  <dd className="tabular-nums">{fmt(q.feeKesMinor, "KES")}</dd>
                </div>
              </dl>
              <p className="mt-3 border-t pt-3 text-lg font-semibold">
                You&apos;ll receive <span className="tabular-nums">{fmt(q.receiveKesMinor, "KES")}</span>
              </p>
            </div>
            {currency !== "KES" && (
              <div role="radio" aria-checked={false} aria-disabled className="rounded-xl border p-4 opacity-55">
                <p className="font-medium">Keep in {currency}</p>
                <p className="text-sm text-muted-foreground">Needs a {currency} account. Not available yet.</p>
              </div>
            )}
          </div>
          {overMpesa && <p className="text-sm font-medium text-red-700 dark:text-red-400">M-Pesa takes up to KES 250,000 at a time. Go back and withdraw less, or choose a bank account.</p>}
          {tooSmall && <p className="text-sm font-medium text-red-700 dark:text-red-400">The smallest withdrawal is KES 100 after the fee.</p>}
          <Button className={primaryButton} disabled={overMpesa || tooSmall} onClick={() => setStep(3)}>
            Continue
          </Button>
        </section>
      )}

      {step === 3 && q && account && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Confirm</h2>
          <div className="rounded-xl border p-4">
            <p className="text-3xl font-semibold tabular-nums">{fmt(q.receiveKesMinor, "KES")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              From your {fmt(q.sendMinor, currency)} balance · {EXPECTED_TIME[account.type]}
            </p>
            <div className="mt-3 border-t pt-3">
              <AccountSummary account={account} now={now} />
            </div>
          </div>

          {!challenge ? (
            <>
              {error && (
                <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
                  {error}
                </p>
              )}
              <Button className={primaryButton} disabled={pending} onClick={sendCode}>
                {pending ? "One moment…" : "Send me a code"}
              </Button>
            </>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                confirm();
              }}
            >
              <DemoCodeNote code={challenge.demoCode} sentTo={challenge.sentTo} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="code">6-digit code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="h-12 text-center font-mono text-xl tracking-[0.4em]"
                  autoFocus
                />
              </div>
              {challenge.needsSecond && (
                <div className="flex flex-col gap-2 rounded-xl bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                  <Label htmlFor="second" className="font-medium">
                    {account.used ? "This is a large withdrawal." : "First withdrawal to this account."} Type its last 4 digits to be sure.
                  </Label>
                  <p className="text-sm">
                    {account.provider} {maskedNumber(account)}
                  </p>
                  <Input
                    id="second"
                    inputMode="numeric"
                    maxLength={4}
                    value={second}
                    onChange={(e) => setSecond(e.target.value.replace(/\D/g, ""))}
                    className="h-12 bg-background text-center font-mono text-xl tracking-[0.4em]"
                  />
                </div>
              )}
              {error && (
                <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                className={primaryButton}
                disabled={pending || code.length !== 6 || (challenge.needsSecond && second !== account.last4)}
              >
                {pending ? "Sending…" : `Withdraw ${fmt(q.receiveKesMinor, "KES")}`}
              </Button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
