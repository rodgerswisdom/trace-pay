"use client";

import { useActionState, useState } from "react";
import { BottomBar, primaryButton } from "@/components/bottom-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { strings } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { createDeal, type NewDealState } from "./actions";

type S = (typeof strings)["en"]["newDeal"];

const money = (major: number, c: string) =>
  `${c} ${major.toLocaleString("en-US", { maximumFractionDigits: Number.isInteger(major) ? 0 : 2 })}`;

export function NewDealForm({ s, currencies, rates }: { s: S; currencies: readonly string[]; rates: Record<string, number> }) {
  const [state, action, pending] = useActionState<NewDealState, FormData>(createDeal, {});
  const v = state.values ?? {};
  const e = state.errors ?? {};

  const [weight, setWeight] = useState(v.weightKg ?? "");
  const [price, setPrice] = useState(v.pricePerKg ?? "");
  const [currency, setCurrency] = useState(v.currency ?? currencies[0]);
  const [pct, setPct] = useState(Number(v.depositPct ?? 30));
  const [finalPct, setFinalPct] = useState(Number(v.finalPct ?? 10));
  const [adjust, setAdjust] = useState(v.breachAdjustPct ?? "10");

  const total = (Number(weight) || 0) * (Number(price) || 0);
  const deposit = Math.round(total * pct) / 100;
  const final = Math.round(total * finalPct) / 100;
  const balance = total - deposit - final;
  const kes = Math.round((total * (rates[currency] ?? 0)) / 100) * 100;

  return (
    <form action={action} className="flex flex-col gap-6 pb-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-10" noValidate>
      <div className="flex flex-col gap-8">
        <Block title={s.buyer} className="sm:grid-cols-2">
          <Field name="buyerCompany" label={s.company} error={e.buyerCompany} defaultValue={v.buyerCompany} autoComplete="organization" />
          <Field name="buyerContact" label={s.contact} error={e.buyerContact} defaultValue={v.buyerContact} autoComplete="name" />
          <Field name="buyerEmail" label={s.email} error={e.buyerEmail} defaultValue={v.buyerEmail} type="email" autoComplete="email" inputMode="email" />
          <Field name="buyerPhone" label={s.phone} error={e.buyerPhone} defaultValue={v.buyerPhone} type="tel" autoComplete="tel" inputMode="tel" placeholder="+971 50 123 4567" />
        </Block>

        <Block title={s.shipment} className="sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product">{s.product}</Label>
            <select id="product" name="product" defaultValue={v.product ?? "Hass"} className={selectClass}>
              <option>Hass</option>
              <option>Fuerte</option>
            </select>
          </div>
          <Field name="weightKg" label={s.weight} error={e.weightKg} value={weight} onChange={setWeight} inputMode="numeric" placeholder="1500" />
          <Field name="destination" label={s.destination} error={e.destination} defaultValue={v.destination} placeholder="Dubai" />
          <Field name="dispatchDate" label={s.dispatchDate} error={e.dispatchDate} defaultValue={v.dispatchDate} type="date" />
        </Block>

        <Block title={s.terms}>
          <div className="grid grid-cols-[1fr_7rem] gap-3 sm:max-w-md">
            <Field name="pricePerKg" label={s.pricePerKg} error={e.pricePerKg} value={price} onChange={setPrice} inputMode="decimal" placeholder="2.10" />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currency">{s.currency}</Label>
              <select id="currency" name="currency" value={currency} onChange={(ev) => setCurrency(ev.target.value)} className={selectClass}>
                {currencies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:max-w-md">
            <div className="flex items-baseline justify-between">
              <Label>{s.depositPct}</Label>
              <span className="text-sm font-medium">
                {pct}% · {money(deposit, currency)}
              </span>
            </div>
            <input type="hidden" name="depositPct" value={pct} />
            <Slider value={[pct]} min={10} max={90} step={5} onValueChange={(val) => setPct(Array.isArray(val) ? val[0] : val)} aria-label={s.depositPct} />
            <div className="grid grid-cols-3 gap-2">
              {[20, 30, 50].map((q) => (
                <Button key={q} type="button" variant={pct === q ? "default" : "outline"} className="h-11" onClick={() => setPct(q)}>
                  {q}%
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:max-w-md">
            <div className="flex items-baseline justify-between">
              <Label>{s.finalPct}</Label>
              <span className="text-sm font-medium">
                {finalPct}% · {money(final, currency)}
              </span>
            </div>
            <input type="hidden" name="finalPct" value={finalPct} />
            <div className="grid grid-cols-3 gap-2">
              {[0, 10, 20].map((q) => (
                <Button key={q} type="button" variant={finalPct === q ? "default" : "outline"} className="h-11" onClick={() => setFinalPct(q)}>
                  {q === 0 ? s.finalNone : `${q}%`}
                </Button>
              ))}
            </div>
            {e.finalPct && <p className="text-sm text-destructive">{e.finalPct}</p>}
          </div>
        </Block>

        <Block title={s.quality}>
          <p className="-mt-2 text-sm text-muted-foreground">{s.qualityHint}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="minDryMatterPct" label={s.minDryMatter} error={e.minDryMatterPct} defaultValue={v.minDryMatterPct ?? "23"} inputMode="decimal" />
            <div className="flex flex-col gap-1.5">
              <Label>{s.tempRange}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input name="tempMinC" aria-label={`${s.tempRange} ${s.tempFrom}`} defaultValue={v.tempMinC ?? "4.5"} inputMode="decimal" className="h-12 text-base" aria-invalid={!!e.tempMinC} />
                <Input name="tempMaxC" aria-label={`${s.tempRange} ${s.tempTo}`} defaultValue={v.tempMaxC ?? "7"} inputMode="decimal" className="h-12 text-base" aria-invalid={!!e.tempMinC} />
              </div>
              {(e.tempMinC || e.tempMaxC) && <p className="text-sm text-destructive">{e.tempMinC ?? e.tempMaxC}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Field name="weightTolerancePct" label={s.weightTolerance} error={e.weightTolerancePct} defaultValue={v.weightTolerancePct ?? "2"} inputMode="decimal" />
              {!e.weightTolerancePct && <p className="-mt-1 text-xs text-muted-foreground">{s.weightToleranceHint}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adjustWindowHours">{s.window}</Label>
              <select id="adjustWindowHours" name="adjustWindowHours" defaultValue={v.adjustWindowHours ?? "120"} className={selectClass}>
                {[3, 5, 7].map((d) => (
                  <option key={d} value={d * 24}>
                    {s.windowDays.replace("{days}", String(d))}
                  </option>
                ))}
              </select>
            </div>
            <Field
              className="sm:col-span-2 sm:max-w-md"
              name="breachAdjustPct"
              label={s.breachAdjust}
              error={e.breachAdjustPct}
              value={adjust}
              onChange={setAdjust}
              inputMode="numeric"
            />
          </div>
          {Number(adjust) > 0 && total > 0 && (
            <p className="text-sm text-muted-foreground">= {money(Math.round(total * Number(adjust)) / 100, currency)}</p>
          )}
        </Block>
      </div>

      <aside className="lg:sticky lg:top-24 lg:rounded-xl lg:border lg:bg-muted/30 lg:p-5">
        <BottomBar>
          <div className="text-sm leading-snug md:text-base" aria-live="polite">
            <p>
              <span className="font-semibold">
                {s.total} {money(total, currency)}
              </span>{" "}
              · {s.depositPct} {money(deposit, currency)} {s.depositNow} · {s.balance} {money(balance, currency)} {s.balanceAfter}
              {final > 0 && ` · ${s.finalShort} ${money(final, currency)} ${s.onArrival}`}
            </p>
            <p className="text-muted-foreground">
              ≈ KES {kes.toLocaleString("en-US")} ({s.estimate})
            </p>
          </div>
          <Button type="submit" className={primaryButton} disabled={pending}>
            {pending ? "…" : s.submit}
          </Button>
        </BottomBar>
      </aside>
    </form>
  );
}

const selectClass =
  "h-12 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Block({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</legend>
      <div className={cn("grid gap-4", className)}>{children}</div>
    </fieldset>
  );
}

function Field({
  name,
  label,
  error,
  onChange,
  className,
  ...props
}: { name: string; label: string; error?: string; onChange?: (v: string) => void } & Omit<React.ComponentProps<"input">, "onChange">) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : undefined}
        onChange={onChange ? (ev) => onChange(ev.target.value) : undefined}
        className="h-12 text-base"
        {...props}
      />
      {error && (
        <p id={`${name}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
