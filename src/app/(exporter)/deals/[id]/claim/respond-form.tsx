"use client";

import { useActionState, useState } from "react";
import { BottomBar, primaryButton } from "@/components/bottom-bar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { agreedFor, type Decision } from "@/lib/claims";
import type { strings } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { respond, type RespondState } from "./actions";

type S = (typeof strings)["en"]["respond"];

const money = (minor: number, c: string) =>
  `${c} ${(minor / 100).toLocaleString("en-US", { maximumFractionDigits: minor % 100 ? 2 : 0 })}`;

export function RespondForm({
  dealId,
  s,
  currency,
  rate,
  balanceMinor,
  requestedMinor,
  suggestedMinor,
  trancheLabel,
}: {
  dealId: string;
  s: S;
  currency: string;
  rate: number;
  balanceMinor: number;
  requestedMinor: number;
  /** The agreed adjustment from the claim check, when it's less than the ask. */
  suggestedMinor: number | null;
  trancheLabel: string;
}) {
  const [state, action, pending] = useActionState<RespondState, FormData>(respond.bind(null, dealId), {});
  const [decision, setDecision] = useState<Decision | null>(null);
  const [counter, setCounter] = useState(suggestedMinor ? String(suggestedMinor / 100) : "");

  const counterMinor = Math.round((Number(counter.replace(/,/g, "")) || 0) * 100);
  const counterValid = counterMinor > 0 && counterMinor < requestedMinor;
  const agreed = decision ? agreedFor(decision, requestedMinor, counterMinor) : 0;
  const newBalance = balanceMinor - agreed;
  const both = (minor: number) => `${money(minor, currency)} · KES ${Math.round((minor * rate) / 100).toLocaleString("en-US")}`;
  const ready = decision !== null && (decision !== "counter" || counterValid);

  const options: { value: Decision; title: string; hint: string; result: string }[] = [
    { value: "accept", title: s.accept, hint: s.acceptHint, result: `${s.newBalance}: ${both(balanceMinor - requestedMinor)}` },
    {
      value: "counter",
      title: s.counter,
      hint: s.counterHint,
      result: counterValid ? `${s.newBalance}: ${both(balanceMinor - counterMinor)}` : s.counterHint,
    },
    { value: "reject", title: s.reject, hint: s.rejectHint, result: `${s.balanceStays}: ${both(balanceMinor)}` },
  ];

  return (
    <form action={action} className="flex flex-col gap-4 lg:rounded-xl lg:border lg:p-5">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{s.choose}</h2>
      <p className="-mt-2 text-sm text-muted-foreground">
        {trancheLabel}: {both(balanceMinor)}
      </p>
      <input type="hidden" name="decision" value={decision ?? ""} />

      <div role="radiogroup" aria-label={s.choose} className="flex flex-col gap-2">
        {options.map((o) => {
          const active = decision === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setDecision(o.value)}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-xl border p-4 text-left transition-colors",
                active ? "border-2 border-primary bg-primary/5" : "hover:bg-muted/50",
              )}
            >
              <span className="font-medium">{o.title}</span>
              <span className="text-sm text-muted-foreground">{o.hint}</span>
              <span className={cn("mt-1 text-sm font-medium", active ? "text-primary" : "text-foreground")}>{o.result}</span>
            </button>
          );
        })}
      </div>

      {decision === "counter" && (
        <div className="flex flex-col gap-1.5">
          {suggestedMinor != null && (
            <p className="text-sm text-muted-foreground">
              {s.suggested.replace("{amount}", money(suggestedMinor, currency))}
            </p>
          )}
          <Label htmlFor="counter">
            {s.counterAmount} ({currency})
          </Label>
          <input
            id="counter"
            name="counter"
            inputMode="decimal"
            value={counter}
            onChange={(e) => setCounter(e.target.value)}
            placeholder={String(Math.round(requestedMinor / 200))}
            className="h-12 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      )}

      {decision && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="note">{s.note}</Label>
          <Textarea
            id="note"
            name="note"
            rows={3}
            required={decision === "reject"}
            minLength={decision === "reject" ? 5 : undefined}
            className="text-base"
            placeholder={decision === "reject" ? s.notePlaceholderReject : s.notePlaceholder}
          />
        </div>
      )}

      {state.error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <BottomBar>
        {!decision && <p className="text-sm text-muted-foreground">{s.pickOne}</p>}
        <Button type="submit" className={primaryButton} disabled={!ready || pending}>
          {pending ? "…" : s.confirm.replace("{amount}", ready ? money(newBalance, currency) : "—")}
        </Button>
      </BottomBar>
    </form>
  );
}
