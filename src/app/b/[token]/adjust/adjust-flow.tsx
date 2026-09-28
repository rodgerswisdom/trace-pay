"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import imageCompression from "browser-image-compression";
import { ArrowLeftIcon, CameraIcon, CheckCircle2Icon, CircleIcon, FileTextIcon, ImageIcon, RotateCwIcon, WifiOffIcon } from "lucide-react";
import { BottomBar, primaryButton } from "@/components/bottom-bar";
import { DeadlineChip } from "@/components/deadline-chip";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { Field, MeasuredBy, Requirement, TermKey } from "@/lib/terms";
import { cn } from "@/lib/utils";
import { sendAdjustment } from "./actions";

// The buyer's adjustment flow: four steps, one job each. Calm, checkout-like wording. No amount to type:
// the adjustment comes from the agreed terms. Progress is kept on this phone if the page reloads.

export type TermOption = {
  key: TermKey;
  name: string;
  standard: string;
  evidenceLine: string;
  fields: Field[];
  requirements: Record<MeasuredBy, Requirement[]>;
  rule: { kind: "min"; value: number } | { kind: "range"; min: number; max: number };
};

type Upload = { id: string; requirement: string; fileName: string; status: "uploading" | "added" | "failed"; progress: number; key?: string; error?: string; file?: File };

const STEPS = ["Choose the term", "Your measurement", "Evidence", "Review"] as const;

export function AdjustFlow(props: {
  token: string;
  dealNumber: string;
  exporterName: string;
  terms: TermOption[];
  currency: string;
  kesRate: number;
  tranche: { label: string; amount: number };
  adjustmentMinor: number;
  adjustPct: number;
  totalLabel: string;
  windowEndsAt: string;
}) {
  const { token, terms, currency, kesRate, tranche } = props;
  const storageKey = `tp-adjust:${token}`;
  const [step, setStep] = useState(0);
  const [termKey, setTermKey] = useState<TermKey | null>(terms.length === 1 ? terms[0].key : null);
  const [measuredBy, setMeasuredBy] = useState<MeasuredBy>("buyer");
  const [values, setValues] = useState<Record<string, string>>({});
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, startTransition] = useTransition();
  const restored = useRef(false);

  // Keep progress on this phone (weak signal, accidental reloads). Files already uploaded stay uploaded.
  // Restored after hydration on purpose: session storage only exists in the browser, so reading it during
  // render would make the server and client markup differ.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (saved) {
        setStep(saved.step ?? 0);
        setTermKey(saved.termKey ?? null);
        setMeasuredBy(saved.measuredBy ?? "buyer");
        setValues(saved.values ?? {});
        setUploads((saved.uploads ?? []).filter((u: Upload) => u.status === "added"));
      }
    } catch {}
    restored.current = true;
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [storageKey]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!restored.current) return;
    try {
      // Files themselves can't be stored; uploaded ones are already on the server.
      const keep = uploads.filter((u) => u.status === "added").map((u) => ({ ...u, file: undefined }));
      sessionStorage.setItem(storageKey, JSON.stringify({ step, termKey, measuredBy, values, uploads: keep }));
    } catch {}
  }, [storageKey, step, termKey, measuredBy, values, uploads]);

  const term = terms.find((t) => t.key === termKey) ?? null;
  const both = (minor: number) =>
    `${currency} ${(minor / 100).toLocaleString("en-US", { maximumFractionDigits: minor % 100 ? 2 : 0 })} · KES ${Math.round((minor * kesRate) / 100).toLocaleString("en-US")}`;
  const newAmount = tranche.amount - props.adjustmentMinor;

  // Step 2: parse and check the measurement.
  const parsed: Record<string, number | undefined> = {};
  const fieldErrors: Record<string, string> = {};
  for (const f of term?.fields ?? []) {
    const raw = (values[f.name] ?? "").replace(",", ".").trim();
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || (f.integer && !Number.isInteger(n))) fieldErrors[f.name] = `Enter a number in ${f.unit}`;
    else if (f.name === "sampleSize" && n < f.min) fieldErrors[f.name] = f.helper ?? `At least ${f.min}`;
    else if (n < f.min || n > f.max) fieldErrors[f.name] = `Check this value`;
    else parsed[f.name] = n;
  }
  const mainField = term?.fields[0];
  const mainValue = mainField ? parsed[mainField.name] : undefined;
  const meets =
    term && mainValue != null ? (term.rule.kind === "min" ? mainValue >= term.rule.value : mainValue >= term.rule.min && mainValue <= term.rule.max) : null;
  const measurementComplete = !!term && term.fields.every((f) => parsed[f.name] != null);

  // Step 3: evidence.
  const requirements = term ? term.requirements[measuredBy] : [];
  const added = (id: string) => uploads.filter((u) => u.requirement === id && u.status === "added");
  const stillNeeded = requirements.filter((r) => !r.optional && added(r.id).length === 0);
  const uploading = uploads.some((u) => u.status === "uploading");

  const reason = (() => {
    if (step === 0 && !term) return "Choose the term that wasn't met.";
    if (step === 1) {
      if (!measurementComplete) return `Enter ${term!.fields.filter((f) => parsed[f.name] == null).map((f) => f.label.toLowerCase()).join(" and ")}.`;
      if (meets) return "This measurement meets the agreed term, so no adjustment applies.";
    }
    if (step === 2) {
      if (uploading) return "Waiting for uploads to finish.";
      if (stillNeeded.length) return `Still needed: ${stillNeeded.map((r) => r.label.toLowerCase()).join(", ")}.`;
    }
    if (step === 3 && !confirmed) return "Tick the box to confirm the details are accurate.";
    return null;
  })();

  function upload(requirement: string, file: File, existingId?: string) {
    const id = existingId ?? crypto.randomUUID();
    const patch = (p: Partial<Upload>) => setUploads((us) => us.map((u) => (u.id === id ? { ...u, ...p } : u)));
    if (!existingId) setUploads((us) => [...us, { id, requirement, fileName: file.name, status: "uploading", progress: 0, file }]);
    else patch({ status: "uploading", progress: 0, error: undefined });
    (async () => {
      let f = file;
      if (file.type.startsWith("image/")) {
        try {
          const out = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 2048, useWebWorker: true, initialQuality: 0.8 });
          f = new File([out], file.name, { type: out.type || file.type });
        } catch {}
      }
      const form = new FormData();
      form.set("file", f, f.name);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/b/${token}/claim-photos`);
      xhr.upload.onprogress = (e) => e.lengthComputable && patch({ progress: Math.round((e.loaded / e.total) * 100) });
      xhr.onload = () => {
        let body: { key?: string; error?: string } = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {}
        if (xhr.status < 300 && body.key) patch({ status: "added", key: body.key, progress: 100 });
        else patch({ status: "failed", error: body.error ?? "Upload didn't finish." });
      };
      xhr.onerror = () => patch({ status: "failed", error: navigator.onLine ? "Upload didn't finish." : "No connection." });
      xhr.send(form);
    })();
  }

  function next() {
    setError(null);
    if (step < 3) {
      setStep(step + 1);
      window.scrollTo({ top: 0 });
      return;
    }
    startTransition(async () => {
      const res = await sendAdjustment(token, {
        term: term!.key,
        measuredBy,
        measurement: parsed,
        evidence: uploads.filter((u) => u.status === "added" && u.key).map((u) => ({ requirement: u.requirement, key: u.key!, fileName: u.fileName })),
        confirmed,
      });
      if (res?.error) setError(res.error);
      else {
        try {
          sessionStorage.removeItem(storageKey);
        } catch {}
      }
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Header: back, title, deadline, progress. Stays visible on every step. */}
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-xl items-center gap-2 px-4 pt-2">
          {step === 0 ? (
            <Link href={`/b/${token}`} className="-ml-2 inline-flex size-12 items-center justify-center rounded-lg hover:bg-muted" aria-label="Back to the deal">
              <ArrowLeftIcon className="size-5" />
            </Link>
          ) : (
            <button type="button" onClick={() => setStep(step - 1)} className="-ml-2 inline-flex size-12 items-center justify-center rounded-lg hover:bg-muted" aria-label="Back">
              <ArrowLeftIcon className="size-5" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Request an adjustment</p>
            <p className="text-xs text-muted-foreground">
              Step {step + 1} of 4 · {STEPS[step]}
            </p>
          </div>
          <DeadlineChip endsAt={props.windowEndsAt} />
        </div>
        <div className="mx-auto flex w-full max-w-xl gap-1 px-4 pt-2 pb-2" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 pt-4 pb-6">
        {!online && (
          <p role="status" className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
            <WifiOffIcon aria-hidden className="size-4 shrink-0" />
            No connection. Your answers are kept on this phone. Uploads can be retried when you&apos;re back online.
          </p>
        )}

        {/* The money, on every step */}
        <section className="flex items-end justify-between gap-3 rounded-xl border p-4">
          <div>
            <p className="text-xs text-muted-foreground">{tranche.label} now</p>
            <p className="text-xl font-semibold tabular-nums">{both(tranche.amount)}</p>
          </div>
          <button type="button" onClick={() => setTermsOpen(true)} className="h-12 shrink-0 px-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
            Agreed terms
          </button>
        </section>

        {step === 0 && (
          <section className="flex flex-col gap-3">
            <h1 className="text-xl font-semibold">Which agreed term wasn&apos;t met?</h1>
            <div role="radiogroup" aria-label="Agreed terms" className="flex flex-col gap-3">
              {terms.map((t) => {
                const active = termKey === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      if (termKey !== t.key) {
                        setValues({});
                        setUploads([]);
                      }
                      setTermKey(t.key);
                    }}
                    className={cn("flex items-start gap-3 rounded-xl border p-4 text-left transition-colors", active ? "border-2 border-primary bg-primary/5" : "hover:bg-muted/50")}
                  >
                    {active ? <CheckCircle2Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" /> : <CircleIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
                    <span className="flex flex-col gap-0.5">
                      <span className="font-semibold">{t.name}</span>
                      <span className="text-sm">{t.standard}</span>
                      <span className="text-xs text-muted-foreground">{t.evidenceLine}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step === 1 && term && (
          <section className="flex flex-col gap-4">
            <div>
              <h1 className="text-xl font-semibold">Your measurement</h1>
              <p className="text-sm text-muted-foreground">Agreed: {term.standard}</p>
            </div>
            {term.fields.map((f) => (
              <div key={f.name} className="flex flex-col gap-1.5">
                <label htmlFor={f.name} className="text-sm font-medium">
                  {f.label}
                </label>
                <div className="flex h-12 items-center rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 aria-invalid:border-destructive" aria-invalid={!!fieldErrors[f.name]}>
                  <input
                    id={f.name}
                    inputMode={f.inputMode}
                    value={values[f.name] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                    className="h-full min-w-0 flex-1 bg-transparent px-3 text-base tabular-nums outline-none"
                    aria-describedby={`${f.name}-help`}
                  />
                  <span className="pr-3 text-sm text-muted-foreground">{f.unit}</span>
                </div>
                <p id={`${f.name}-help`} className={cn("text-xs", fieldErrors[f.name] ? "text-destructive" : "text-muted-foreground")}>
                  {fieldErrors[f.name] ?? f.helper ?? " "}
                </p>
              </div>
            ))}
            <div>
              <p id="by-label" className="mb-2 text-sm font-medium">
                Measured by
              </p>
              <div role="radiogroup" aria-labelledby="by-label" className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["inspector", "An inspector"],
                    ["buyer", "Us"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={measuredBy === v}
                    onClick={() => setMeasuredBy(v)}
                    className={cn("h-12 rounded-lg border text-sm font-medium", measuredBy === v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {measuredBy === "inspector" ? "Shown as Independent. You'll add the inspector's report." : "Shown as Recorded by buyer."}
              </p>
            </div>
            {meets && (
              <p role="status" className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
                <CheckCircle2Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="font-medium">Meets term.</span> {term.standard}. An adjustment applies only below it.
                </span>
              </p>
            )}
          </section>
        )}

        {step === 2 && term && (
          <section className="flex flex-col gap-3">
            <div>
              <h1 className="text-xl font-semibold">Evidence</h1>
              <p className="text-sm text-muted-foreground">What the agreed terms ask for. Photos are taken at the size needed, not full resolution.</p>
            </div>
            <ol className="flex flex-col gap-3">
              {requirements.map((r) => {
                const rowUploads = uploads.filter((u) => u.requirement === r.id);
                const done = added(r.id).length > 0;
                return (
                  <li key={r.id} className={cn("rounded-xl border p-4", done && "border-emerald-300 dark:border-emerald-800")}>
                    <div className="flex items-start gap-3">
                      {done ? <CheckCircle2Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-emerald-600" /> : <CircleIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{r.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {done ? "Added" : r.optional ? "Optional" : "Needed"} · {r.accept === "photo" ? "Photo" : "Photo or PDF"}
                        </p>
                        {rowUploads.length > 0 && (
                          <ul className="mt-2 flex flex-col gap-2">
                            {rowUploads.map((u) => (
                              <li key={u.id} className="flex items-center gap-2 text-sm">
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate">{u.fileName}</span>
                                  {u.status === "uploading" && (
                                    <span className="mt-1 flex items-center gap-2">
                                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                        <span className="block h-full bg-primary transition-[width]" style={{ width: `${Math.max(5, u.progress)}%` }} />
                                      </span>
                                      <span className="w-16 text-right text-xs text-muted-foreground">Uploading</span>
                                    </span>
                                  )}
                                  {u.status === "added" && <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">✓ Added</span>}
                                  {u.status === "failed" && <span className="text-xs text-destructive">{u.error}</span>}
                                </span>
                                {u.status === "failed" && u.file && (
                                  <Button type="button" variant="outline" className="h-11 gap-1.5" onClick={() => upload(u.requirement, u.file!, u.id)}>
                                    <RotateCwIcon className="size-4" />
                                    Retry
                                  </Button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {rowUploads.length < 4 && (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <PickButton icon={<CameraIcon className="size-4" />} label="Take photo" accept="image/*" capture onPick={(f) => upload(r.id, f)} />
                            <PickButton
                              icon={r.accept === "photo" ? <ImageIcon className="size-4" /> : <FileTextIcon className="size-4" />}
                              label={r.accept === "photo" ? "From gallery" : "Photo or PDF"}
                              accept={r.accept === "photo" ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf"}
                              onPick={(f) => upload(r.id, f)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {step === 3 && term && (
          <section className="flex flex-col gap-4">
            <h1 className="text-xl font-semibold">Review</h1>
            {/* The hero: the money */}
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5">
              <p className="text-sm text-muted-foreground">New {tranche.label.toLowerCase()}</p>
              <p className="mt-1 text-sm text-muted-foreground line-through tabular-nums">{both(tranche.amount)}</p>
              <p className="text-3xl font-semibold tabular-nums">{both(newAmount).split(" · ")[0]}</p>
              <p className="text-base font-medium text-muted-foreground tabular-nums">{both(newAmount).split(" · ")[1]}</p>
              <p className="mt-3 text-sm">
                Agreed terms: {props.adjustPct}% of the deal value ({props.totalLabel}) comes off when {term.name.toLowerCase()} is outside the term.
              </p>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border p-4 text-sm">
              <dt className="text-muted-foreground">Term</dt>
              <dd>{term.standard}</dd>
              <dt className="text-muted-foreground">Measured</dt>
              <dd>
                {term.fields.map((f) => `${parsed[f.name]?.toLocaleString("en-US")}${f.unit === "%" ? "" : " "}${f.unit}`).join(" · ")}
              </dd>
              <dt className="text-muted-foreground">Source</dt>
              <dd>{measuredBy === "inspector" ? "Independent" : "Recorded by buyer"}</dd>
              <dt className="text-muted-foreground">Evidence</dt>
              <dd>
                {uploads.filter((u) => u.status === "added").length} file{uploads.filter((u) => u.status === "added").length === 1 ? "" : "s"} added
              </dd>
            </dl>
            <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]" />
              <span>These measurements and photos are accurate and were taken from this delivery.</span>
            </label>
            <p className="text-xs text-muted-foreground">
              {props.exporterName} reviews the request against the dispatch records. The {tranche.label.toLowerCase()} is on hold until then.
            </p>
          </section>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </main>

      <BottomBar className="mx-auto w-full max-w-xl">
        {reason && <p className="text-sm text-muted-foreground">{reason}</p>}
        <Button type="button" className={primaryButton} disabled={!!reason || pending} onClick={next}>
          {step < 3 ? "Continue" : pending ? "Sending…" : "Request adjustment"}
        </Button>
      </BottomBar>

      <Sheet open={termsOpen} onOpenChange={setTermsOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="mx-auto max-w-lg gap-3 rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <SheetTitle className="text-lg font-semibold">Agreed terms · Deal {props.dealNumber}</SheetTitle>
          <ul className="flex flex-col gap-3 text-sm">
            {terms.map((t) => (
              <li key={t.key}>
                <p className="font-medium">{t.name}</p>
                <p>{t.standard}</p>
                <p className="text-xs text-muted-foreground">{t.evidenceLine}</p>
              </li>
            ))}
            <li>
              <p className="font-medium">If a term isn&apos;t met</p>
              <p>
                {props.adjustPct}% of the deal value ({props.totalLabel}) comes off the unpaid amount.
              </p>
            </li>
          </ul>
          <Button type="button" variant="outline" className="h-12 text-base" onClick={() => setTermsOpen(false)}>
            Close
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function PickButton({ icon, label, accept, capture, onPick }: { icon: React.ReactNode; label: string; accept: string; capture?: boolean; onPick: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        capture={capture ? "environment" : undefined}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onPick(f);
        }}
      />
      <Button type="button" variant="outline" className="h-12 gap-2 text-sm" onClick={() => ref.current?.click()}>
        {icon}
        {label}
      </Button>
    </>
  );
}
