"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2Icon, Clock3Icon } from "lucide-react";
import { primaryButton } from "@/components/bottom-bar";
import { FlowHeader } from "@/components/flow-header";
import { ProviderMark } from "@/components/getting-paid";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PayoutAccountType } from "@/db/schema";
import { ACCOUNT_TYPES, KENYAN_BANKS, holdLabel, normalizeKenyanMobile } from "@/lib/getting-paid";
import { cn } from "@/lib/utils";
import { freezeWithdrawals } from "../../../getting-paid-actions";
import { FreezeNotice, SecureConfirm } from "../secure-confirm";

const STEPS = ["Type", "Details", "Confirm"] as const;

export function AddAccountFlow({ backHref, nextHref, nextLabel }: { backHref: string; nextHref: string; nextLabel: string }) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState<PayoutAccountType | null>(null);
  const [bankCode, setBankCode] = useState("");
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [nameChecked, setNameChecked] = useState(false);
  const [done, setDone] = useState<{ activeAt: string; email: string } | null>(null);
  const [frozen, setFrozen] = useState(false);

  const mpesa = type === "mpesa_phone";
  const bank = KENYAN_BANKS.find((b) => b.code === bankCode);
  const numberOk = mpesa ? !!normalizeKenyanMobile(number) : /^\d{6,16}$/.test(number.replace(/[\s-]/g, ""));
  const detailsOk = numberOk && name.trim().length >= 3 && nameChecked && (mpesa || !!bank);
  const provider = mpesa ? "M-Pesa" : (bank?.name ?? "");

  if (done) return <AddedScreen {...done} provider={provider} last4={number.replace(/\D/g, "").slice(-4)} nextHref={nextHref} nextLabel={nextLabel} frozen={frozen} onFreeze={async () => {
    await freezeWithdrawals();
    setFrozen(true);
  }} />;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <FlowHeader title="Add an account" steps={STEPS} step={step} backHref={backHref} onBack={step > 0 ? () => setStep(step - 1) : undefined} />

      {step === 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Where should your money go?</h2>
          <div role="radiogroup" aria-label="Account type" className="flex flex-col gap-2">
            {ACCOUNT_TYPES.map((t) => (
              <button
                key={t.type}
                type="button"
                role="radio"
                aria-checked={type === t.type}
                disabled={!t.available}
                onClick={() => {
                  setType(t.type);
                  setNumber("");
                  setNameChecked(false);
                  setStep(1);
                }}
                className={cn(
                  "flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                  t.available ? "hover:bg-muted/50" : "cursor-not-allowed opacity-55",
                  type === t.type && "border-primary ring-2 ring-primary/30",
                )}
              >
                <ProviderMark type={t.type} provider={t.type === "usd_bank" ? "USD" : t.label} />
                <span className="flex-1">
                  <span className="block font-medium">{t.label}</span>
                  <span className="block text-sm text-muted-foreground">{t.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 1 && type && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (detailsOk) setStep(2);
          }}
        >
          <h2 className="text-xl font-semibold">{mpesa ? "Your M-Pesa number" : "Your bank account"}</h2>
          {!mpesa && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="bank">Bank</Label>
              <select
                id="bank"
                required
                value={bankCode}
                onChange={(e) => setBankCode(e.target.value)}
                className="h-12 rounded-lg border border-input bg-background px-3 text-base"
              >
                <option value="">Choose your bank</option>
                {KENYAN_BANKS.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="number">{mpesa ? "Phone number" : "Account number"}</Label>
            <Input
              id="number"
              inputMode="numeric"
              autoComplete="off"
              placeholder={mpesa ? "0712 345 678" : "Digits only"}
              value={number}
              onChange={(e) => {
                setNumber(e.target.value);
                setNameChecked(false);
              }}
              className="h-12 text-base tabular-nums"
            />
            {number && !numberOk && (
              <p className="text-sm text-red-700 dark:text-red-400">{mpesa ? "Enter a Safaricom number, like 0712 345 678." : "Enter 6 to 16 digits."}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">{mpesa ? "Name registered on M-Pesa" : "Name on the account"}</Label>
            <Input id="name" autoComplete="name" value={name} onChange={(e) => {
              setName(e.target.value);
              setNameChecked(false);
            }} className="h-12 text-base" />
          </div>
          {/* Name lookup: Payaza can't look up Kenyan names yet, so the exporter checks it themselves. */}
          {numberOk && name.trim().length >= 3 && (
            <label className="flex min-h-12 items-start gap-3 rounded-xl border p-3">
              <input type="checkbox" checked={nameChecked} onChange={(e) => setNameChecked(e.target.checked)} className="mt-1 size-5 accent-[var(--primary)]" />
              <span className="text-sm">
                <span className="font-medium">{name.trim()}</span> is the name {mpesa ? "M-Pesa shows for this number" : "on this account"}.{" "}
                <span className="text-muted-foreground">We can&apos;t look up Kenyan account names yet. If the name doesn&apos;t match, the money comes back to your balance.</span>
              </span>
            </label>
          )}
          <Button type="submit" disabled={!detailsOk} className={primaryButton}>
            Continue
          </Button>
        </form>
      )}

      {step === 2 && type && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Confirm it&apos;s you</h2>
          <div className="flex items-center gap-3 rounded-xl border p-4">
            <ProviderMark type={type} provider={provider} />
            <div className="min-w-0">
              <p className="font-medium">
                {provider} <span className="tabular-nums">{mpesa ? normalizeKenyanMobile(number)?.replace(/^254/, "0") : number.replace(/[\s-]/g, "")}</span>
              </p>
              <p className="truncate text-sm text-muted-foreground">{name.trim()}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            For your safety, a new account can receive money 24 hours after you add it. After saving we only ever show the last 4 digits.
          </p>
          <SecureConfirm
            change={{ op: "add", type, bankCode, accountNumber: number, accountName: name }}
            confirmLabel="Add account"
            onDone={(r) => setDone({ activeAt: r.activeAt!, email: r.email })}
          />
        </section>
      )}
    </div>
  );
}

function AddedScreen({
  activeAt,
  email,
  provider,
  last4,
  nextHref,
  nextLabel,
  frozen,
  onFreeze,
}: {
  activeAt: string;
  email: string;
  provider: string;
  last4: string;
  nextHref: string;
  nextLabel: string;
  frozen: boolean;
  onFreeze: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const hold = holdLabel(activeAt, now);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 py-4">
      <CheckCircle2Icon aria-hidden className="size-12 text-emerald-600" />
      <div>
        <h1 className="text-2xl font-semibold">Account added</h1>
        <p className="mt-1 text-muted-foreground">
          {provider} •••• {last4}
        </p>
      </div>
      {hold && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <Clock3Icon aria-hidden className="size-5 shrink-0" />
          <span>
            <span className="font-semibold">{hold}.</span> You can withdraw to it from{" "}
            {new Date(activeAt).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}.
          </span>
        </p>
      )}
      {frozen ? (
        <p className="rounded-xl border p-4 text-sm">Withdrawals are frozen. Nothing can leave your balance until you unfreeze them in Account.</p>
      ) : (
        <FreezeNotice email={email} onFreeze={onFreeze} />
      )}
      <Link href={nextHref} className={cn(buttonVariants(), primaryButton)}>
        {nextLabel}
      </Link>
    </div>
  );
}
