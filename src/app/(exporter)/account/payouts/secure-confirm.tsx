"use client";

import { useState, useTransition } from "react";
import { primaryButton } from "@/components/bottom-bar";
import { DemoCodeNote } from "@/components/getting-paid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type AccountChange, type ChangeResult, confirmAccountChange, startAccountChange } from "../../getting-paid-actions";

/**
 * Password, then a one-time code. Used for every change to where money goes.
 * `confirmLabel` names the change on the final button, e.g. "Add account".
 */
export function SecureConfirm({
  change,
  confirmLabel,
  onDone,
}: {
  change: AccountChange;
  confirmLabel: string;
  onDone: (result: Extract<ChangeResult, { ok: true }>) => void;
}) {
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<{ id: string; demoCode: string; sentTo: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sendCode = () =>
    startTransition(async () => {
      setError(null);
      const r = await startAccountChange(change, password);
      if (!r.ok) return setError(r.error);
      setChallenge({ id: r.challengeId, demoCode: r.demoCode, sentTo: r.sentTo });
      setCode("");
    });

  const confirm = () =>
    startTransition(async () => {
      setError(null);
      const r = await confirmAccountChange(change.op, challenge!.id, code);
      if (!r.ok) {
        setError(r.error);
        if (/Start again/.test(r.error)) setChallenge(null);
        return;
      }
      onDone(r);
    });

  return (
    <div className="flex flex-col gap-4">
      {!challenge ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            sendCode();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="pw">Your TRACE Pay password</Label>
            <Input id="pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 text-base" />
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending || !password} className={primaryButton}>
            {pending ? "One moment…" : "Send me a code"}
          </Button>
        </form>
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
          {error && (
            <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending || code.length !== 6} className={primaryButton}>
            {pending ? "One moment…" : confirmLabel}
          </Button>
          <button type="button" onClick={sendCode} disabled={pending} className="h-11 text-sm font-medium text-primary underline-offset-4 hover:underline">
            Send a new code
          </button>
        </form>
      )}
    </div>
  );
}

/** Shown after any account change: in the live product this goes by email too. */
export function FreezeNotice({ email, onFreeze }: { email: string; onFreeze: () => void }) {
  return (
    <div className="rounded-xl border p-4 text-sm">
      <p>
        We&apos;d also email <span className="font-medium">{email}</span> about this change, with a button to freeze withdrawals.{" "}
        <span className="text-muted-foreground">(Email isn&apos;t connected in this demo.)</span>
      </p>
      <p className="mt-2">
        Wasn&apos;t you?{" "}
        <button type="button" onClick={onFreeze} className="inline-flex h-11 items-center font-medium text-primary underline-offset-4 hover:underline">
          Freeze withdrawals
        </button>
      </p>
    </div>
  );
}
