"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { primaryButton } from "@/components/bottom-bar";
import { payNext, startPayment } from "@/app/b/[token]/actions";

// Payaza's Web Checkout SDK: an inline modal on our page, with a callback for success or failure.
// The callback is only a trigger — our server confirms every payment with Payaza before marking it paid.
// If the SDK can't load (weak signal), we fall back to Payaza's hosted page; without JavaScript the plain
// form posts to the same flow.

type PayazaInstance = {
  setCallback: (fn: (r: PayazaResponse) => void) => void;
  setOnClose: (fn: () => void) => void;
  showPopup: () => void;
  closeIframe: () => void;
};
type PayazaResponse = { type?: string; status?: number; data?: { message?: string; transactionReference?: string } };
declare global {
  interface Window {
    PayazaCheckout?: { setup: (options: Record<string, unknown>) => PayazaInstance };
  }
}

const SDK_URL = "https://checkout-v2.payaza.africa/js/v1/bundle.js";
type PayazaSdk = NonNullable<Window["PayazaCheckout"]>;
let sdkPromise: Promise<PayazaSdk> | null = null;

function loadSdk(timeoutMs = 8000): Promise<PayazaSdk> {
  if (window.PayazaCheckout) return Promise.resolve(window.PayazaCheckout);
  sdkPromise ??= new Promise<PayazaSdk>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    script.onload = () => {
      clearTimeout(timer);
      if (window.PayazaCheckout) resolve(window.PayazaCheckout);
      else reject(new Error("missing"));
    };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error("network"));
    };
    document.head.appendChild(script);
  }).catch((e) => {
    sdkPromise = null; // allow a retry
    throw e;
  });
  return sdkPromise;
}

type State =
  | { name: "idle" }
  | { name: "starting" }
  | { name: "open" }
  | { name: "verifying"; slow: boolean }
  | { name: "failed"; message: string }
  | { name: "cancelled" };

export function PayButton({ token, label, needsPhone, phoneInvalid }: { token: string; label: string; needsPhone: boolean; phoneInvalid: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ name: "idle" });
  const [phoneError, setPhoneError] = useState(phoneInvalid);
  const instance = useRef<PayazaInstance | null>(null);
  const succeeded = useRef(false);
  const lastError = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  async function verify(reference: string) {
    setState({ name: "verifying", slow: false });
    const started = Date.now();
    // Payaza sometimes takes a few seconds to report the payment; keep asking our server for up to a minute.
    while (alive.current) {
      const res = await fetch(`/api/b/${token}/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as { result?: string } | null;
      if (body?.result === "paid") {
        router.refresh();
        return;
      }
      if (body?.result === "failed") {
        setState({ name: "failed", message: "Payaza reported the payment as failed." });
        return;
      }
      if (Date.now() - started > 60_000) {
        setState({ name: "verifying", slow: true });
        router.refresh();
        return;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const phone = needsPhone ? String(new FormData(e.currentTarget).get("phone") ?? "") : null;
    setState({ name: "starting" });
    setPhoneError(false);
    const r = await startPayment(token, phone);
    if (!r.ok) {
      if (r.reason === "phone") setPhoneError(true);
      if (r.reason === "nothing_due") router.refresh();
      setState({ name: "idle" });
      return;
    }

    let sdk: PayazaSdk;
    try {
      sdk = await loadSdk();
    } catch {
      // Weak signal or blocked script: use Payaza's hosted page instead (it returns via our callback URL).
      window.location.assign(r.fallbackUrl);
      return;
    }

    succeeded.current = false;
    lastError.current = null;
    const checkout = sdk.setup(r.options);
    instance.current = checkout;
    checkout.setCallback((resp) => {
      if (resp?.type === "success") {
        succeeded.current = true;
        lastError.current = null;
        verify(r.reference);
      } else {
        // Declined etc. Payaza keeps its modal open so the buyer can try again.
        lastError.current = resp?.data?.message ?? "The payment didn't go through.";
      }
    });
    checkout.setOnClose(() => {
      instance.current = null;
      if (succeeded.current) return;
      setState(lastError.current ? { name: "failed", message: lastError.current } : { name: "cancelled" });
    });
    checkout.showPopup();
    setState({ name: "open" });
  }

  const busy = state.name === "starting" || state.name === "verifying" || state.name === "open";

  return (
    <form action={payNext.bind(null, token)} onSubmit={onSubmit} className="flex flex-col gap-2">
      {needsPhone && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-sm font-medium">
            Your phone, with country code
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            placeholder="+971 50 123 4567"
            aria-invalid={phoneError}
            className="h-12 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
          />
          <p className={phoneError ? "text-sm text-destructive" : "text-xs text-muted-foreground"}>
            {phoneError ? "Enter your phone with country code, e.g. +971 50 123 4567." : "The card payment page needs it for security checks."}
          </p>
        </div>
      )}

      {state.name === "failed" && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Payment didn&apos;t go through: {state.message} You haven&apos;t been charged. You can try again.
        </p>
      )}
      {state.name === "cancelled" && (
        <p role="status" className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          Payment not completed. Nothing was charged. You can try again when you&apos;re ready.
        </p>
      )}
      {state.name === "verifying" && (
        <p role="status" className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
          <span className="inline-flex items-center gap-2 font-medium">
            <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Confirming payment with Payaza…
          </span>
          {state.slow && (
            <span className="mt-1 block">
              Payaza hasn&apos;t confirmed it yet. If your card was charged, this page will update by itself. You don&apos;t need to pay again.
            </span>
          )}
        </p>
      )}

      <Button type="submit" className={primaryButton} disabled={busy}>
        {state.name === "starting" ? "Opening Payaza…" : state.name === "open" ? "Payment window open…" : state.name === "verifying" ? "Confirming…" : label}
      </Button>

      {/* Our own way out of Payaza's modal: its Close link doesn't respond in test mode. */}
      {state.name === "open" &&
        createPortal(
          <button
            type="button"
            onClick={() => instance.current?.closeIframe()}
            className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[2147483647] inline-flex h-12 -translate-x-1/2 items-center gap-2 rounded-full border bg-background px-5 text-sm font-medium shadow-lg"
          >
            <XIcon className="size-4" />
            Cancel payment
          </button>,
          document.body,
        )}
    </form>
  );
}
