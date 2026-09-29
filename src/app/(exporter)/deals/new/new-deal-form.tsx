"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { ArrowLeftIcon, FileTextIcon, PaperclipIcon, Trash2Icon } from "lucide-react";
import { BottomBar, primaryButton } from "@/components/bottom-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { strings } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { createDeal, type NewDealState } from "./actions";

type S = (typeof strings)["en"]["newDeal"];
type DocumentCategory = keyof S["documentCategories"];
type DocumentEntry = { file: File; category: DocumentCategory };
const REQUIRED_DOCUMENTS: DocumentCategory[] = ["quality_certificate", "origin_traceability"];
const DOCUMENT_ACCEPT: Record<DocumentCategory, string> = {
  quality_certificate: "image/jpeg,image/png,image/webp,application/pdf",
  phytosanitary: "image/jpeg,image/png,image/webp,application/pdf",
  origin_traceability: "image/jpeg,image/png,image/webp,application/pdf",
  inspection_report: "image/jpeg,image/png,image/webp,application/pdf",
  product_photos: "image/jpeg,image/png,image/webp",
};
const DOCUMENT_FORMAT: Record<DocumentCategory, string> = {
  quality_certificate: "PDF or photo",
  phytosanitary: "PDF or photo",
  origin_traceability: "PDF or photo",
  inspection_report: "PDF or photo",
  product_photos: "Images only",
};

const money = (major: number, c: string) =>
  `${c} ${major.toLocaleString("en-US", { maximumFractionDigits: Number.isInteger(major) ? 0 : 2 })}`;

export function NewDealForm({ s, currencies, rates }: { s: S; currencies: readonly string[]; rates: Record<string, number> }) {
  const [state, action, pending] = useActionState<NewDealState, FormData>(createDeal, {});
  const [step, setStep] = useState<1 | 2>(1);
  const documentPicker = useRef<HTMLInputElement>(null);
  const [documentEntries, setDocumentEntries] = useState<DocumentEntry[]>([]);
  const [pickerCategory, setPickerCategory] = useState<DocumentCategory>("quality_certificate");
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
  const uploadedCategories = new Set(documentEntries.map((entry) => entry.category));
  const canCreate = REQUIRED_DOCUMENTS.every((category) => uploadedCategories.has(category)) && !pending;

  function removeDocument(index: number) {
    const next = documentEntries.filter((_, fileIndex) => fileIndex !== index);
    setDocumentEntries(next);
    if (documentPicker.current) {
      const transfer = new DataTransfer();
      next.forEach(({ file }) => transfer.items.add(file));
      documentPicker.current.files = transfer.files;
    }
  }

  function openDocumentPicker(category: DocumentCategory) {
    setPickerCategory(category);
    documentPicker.current?.click();
  }

  return (
    <form action={action} className="flex flex-col gap-6 pb-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-10" noValidate>
      <div className={cn("flex flex-col gap-8", step === 1 ? "" : "hidden")}>
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

        <div className="flex justify-end">
          <Button type="button" className="h-12 px-6" onClick={() => setStep(2)}>{s.next} →</Button>
        </div>

      </div>

      <div className={cn("flex flex-col gap-8", step === 2 ? "" : "hidden")}>
        <Button type="button" variant="ghost" className="-ml-2 h-11 w-fit gap-2 px-2 text-muted-foreground hover:text-foreground" onClick={() => setStep(1)}>
          <ArrowLeftIcon className="size-4" />
          {s.back} · {s.stepDetails}
        </Button>
        <Block title={s.documents}>
          <p className="-mt-2 text-sm text-muted-foreground">{s.documentsHint}</p>
          <input
            ref={documentPicker}
            type="file"
            name="dealDocument"
            accept={DOCUMENT_ACCEPT[pickerCategory]}
            multiple={pickerCategory === "product_photos"}
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const picked = Array.from(event.target.files ?? []).map((file) => ({ file, category: pickerCategory }));
              const next = [...documentEntries, ...picked];
              setDocumentEntries(next);
              event.target.value = "";
              const transfer = new DataTransfer();
              next.forEach(({ file }) => transfer.items.add(file));
              event.target.files = transfer.files;
            }}
          />
          {documentEntries.map((entry, index) => <input key={`${entry.file.name}-${entry.file.size}-${index}`} type="hidden" name="documentCategory" value={entry.category} />)}
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.keys(s.documentCategories).map((category) => {
              const documentCategory = category as DocumentCategory;
              const entries = documentEntries.filter((entry) => entry.category === documentCategory);
              const required = REQUIRED_DOCUMENTS.includes(documentCategory);
              return (
                <section key={documentCategory} className={cn("rounded-xl border p-4", entries.length > 0 && "border-emerald-300 dark:border-emerald-800")}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium">{s.documentCategories[documentCategory]}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{DOCUMENT_FORMAT[documentCategory]}</p>
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs", required ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-muted text-muted-foreground")}>
                      {required ? s.required : s.optional}
                    </span>
                  </div>
                  <Button type="button" variant="outline" className="mt-3 h-11 w-full gap-2" onClick={() => openDocumentPicker(documentCategory)}>
                    <PaperclipIcon className="size-4" />
                    {s.uploadFile}
                  </Button>
                  {entries.length > 0 ? (
                    <ul className="mt-3 flex flex-col gap-2">
                      {entries.map((entry) => {
                        const index = documentEntries.indexOf(entry);
                        return <li key={`${entry.file.name}-${entry.file.size}-${index}`} className="flex items-center gap-2 rounded-lg bg-muted/40 p-2 text-sm"><LocalFileThumb file={entry.file} /><span className="min-w-0 flex-1 truncate">{entry.file.name}</span><span className="text-xs text-emerald-700 dark:text-emerald-400">{s.ready}</span><button type="button" onClick={() => removeDocument(index)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={`${s.removeDocument} ${entry.file.name}`}><Trash2Icon className="size-4" /></button></li>;
                      })}
                    </ul>
                  ) : required ? <p className="mt-3 text-xs text-muted-foreground">{s.documentsRequired}</p> : null}
                </section>
              );
            })}
          </div>
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
          {step === 2 ? (
            <Button type="submit" className={primaryButton} disabled={!canCreate}>{pending ? "…" : canCreate ? s.submit : s.addDocumentsFirst}</Button>
          ) : null}
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

function LocalFileThumb({ file }: { file: File }) {
  const [src, setSrc] = useState<string>();

  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setSrc(typeof reader.result === "string" ? reader.result : undefined);
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- local preview before the file is uploaded
    return <img src={src} alt="" className="size-10 shrink-0 rounded-md bg-muted object-cover" />;
  }
  return <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><FileTextIcon className="size-5" /></span>;
}
