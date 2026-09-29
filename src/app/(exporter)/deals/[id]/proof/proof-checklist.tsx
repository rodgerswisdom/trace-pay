"use client";

import { useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { CameraIcon, CheckCircle2Icon, FileTextIcon, PaperclipIcon, RotateCwIcon, Trash2Icon } from "lucide-react";
import { BottomBar, primaryButton } from "@/components/bottom-bar";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { strings } from "@/lib/i18n";
import { PROOF_SPECS, missingRequired, type ProofSpec, type ProofType } from "@/lib/proof";
import { fmtTimeEAT } from "@/lib/time";
import { cn } from "@/lib/utils";
import { lockProof } from "./actions";

type S = (typeof strings)["en"]["proof"];

export type SavedItem = {
  id: string;
  type: ProofType;
  fileName: string;
  contentType: string;
  value: string | null;
  issuer: string | null;
  receivedAt: string;
};

type Upload = {
  localId: string;
  type: ProofType;
  fileName: string;
  file: File;
  status: "compressing" | "uploading" | "error";
  progress: number;
  error?: string;
};

const PHOTO_ONLY = (spec: ProofSpec) => !spec.accept.includes("pdf");

export function ProofChecklist({
  dealId,
  s,
  balance,
  depositPaid,
  initial,
  showIncomplete,
}: {
  dealId: string;
  s: S;
  balance: string;
  /** Before the deposit, items can be added and are kept, but the balance can't be requested yet. */
  depositPaid: boolean;
  initial: SavedItem[];
  showIncomplete: boolean;
}) {
  const [saved, setSaved] = useState<SavedItem[]>(initial);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [readings, setReadings] = useState<Partial<Record<ProofType, string>>>({});
  const [issuer, setIssuer] = useState("");
  const [sampleSize, setSampleSize] = useState("");
  const [device, setDevice] = useState("");
  const [fieldError, setFieldError] = useState<Partial<Record<ProofType, string>>>({});
  const [confirming, setConfirming] = useState(false);

  const missing = missingRequired(saved.map((i) => ({ type: i.type, sha256: "x" })));
  const busy = uploads.some((u) => u.status !== "error");
  const ready = missing.length === 0 && !busy;

  const patch = (localId: string, p: Partial<Upload>) => setUploads((us) => us.map((u) => (u.localId === localId ? { ...u, ...p } : u)));

  async function prepare(file: File): Promise<File> {
    if (!file.type.startsWith("image/")) return file;
    try {
      // Weak signal: shrink photos on the phone before they go anywhere.
      const out = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 2048, useWebWorker: true, initialQuality: 0.8 });
      return new File([out], file.name, { type: out.type || file.type });
    } catch {
      return file;
    }
  }

  function send(u: Upload, file: File, extra: { value?: string; issuer?: string; sampleSize?: string; device?: string }) {
    const form = new FormData();
    form.set("type", u.type);
    form.set("file", file, u.fileName);
    if (extra.value) form.set("value", extra.value);
    if (extra.issuer) form.set("issuer", extra.issuer);
    if (extra.sampleSize) form.set("sampleSize", extra.sampleSize);
    if (extra.device) form.set("device", extra.device);

    // XHR rather than fetch: we want per-file upload progress.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/deals/${dealId}/proof`);
    xhr.upload.onprogress = (e) => e.lengthComputable && patch(u.localId, { progress: Math.round((e.loaded / e.total) * 100) });
    xhr.onload = () => {
      let body: { item?: SavedItem; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && body.item) {
        setUploads((us) => us.filter((x) => x.localId !== u.localId));
        setSaved((items) => [...items, body.item!]);
      } else {
        patch(u.localId, { status: "error", error: body.error ?? s.failed });
      }
    };
    xhr.onerror = () => patch(u.localId, { status: "error", error: s.failed });
    xhr.send(form);
  }

  async function start(u: Upload) {
    const spec = PROOF_SPECS.find((x) => x.type === u.type)!;
    patch(u.localId, { status: "compressing", progress: 0, error: undefined });
    const file = await prepare(u.file);
    patch(u.localId, { status: "uploading", file });
    send(u, file, {
      value: spec.reading ? readings[u.type] : undefined,
      issuer: spec.issuer ? issuer : undefined,
      sampleSize: spec.structured ? sampleSize : undefined,
      device: spec.structured ? device : undefined,
    });
  }

  function onPick(spec: ProofSpec, files: FileList | null) {
    if (!files?.length) return;
    // Check the fields that travel with the file before anything uploads.
    if (spec.reading?.required && !readings[spec.type]?.trim()) {
      setFieldError((e) => ({ ...e, [spec.type]: s.needReading }));
      return;
    }
    if (spec.structured && (!/^\d+$/.test(sampleSize.trim()) || device.trim().length < 2)) {
      setFieldError((e) => ({ ...e, [spec.type]: s.needSample }));
      return;
    }
    if (spec.issuer && !issuer.trim()) {
      setFieldError((e) => ({ ...e, [spec.type]: s.needIssuer }));
      return;
    }
    setFieldError((e) => ({ ...e, [spec.type]: undefined }));

    const picked = [...files].slice(0, spec.multiple ? 12 : 1);
    const next = picked.map<Upload>((file) => ({
      localId: crypto.randomUUID(),
      type: spec.type,
      fileName: file.name || `${spec.type}.jpg`,
      file,
      status: "compressing",
      progress: 0,
    }));
    setUploads((us) => [...us, ...next]);
    next.forEach(start);
  }

  async function remove(item: SavedItem) {
    const res = await fetch(`/api/deals/${dealId}/proof/${item.id}`, { method: "DELETE" });
    if (res.ok) setSaved((items) => items.filter((i) => i.id !== item.id));
  }

  return (
    <>
      {showIncomplete && missing.length > 0 && (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {s.stillNeeded}: {missing.map((m) => s.items[m].label).join(", ")}
        </p>
      )}

      <ol className="flex flex-col gap-3">
        {PROOF_SPECS.map((spec) => {
          const done = saved.filter((i) => i.type === spec.type);
          const pending = uploads.filter((u) => u.type === spec.type);
          const complete = done.length >= spec.min;
          const canAddMore = spec.multiple || done.length + pending.filter((p) => p.status !== "error").length === 0;
          const label = s.items[spec.type];
          const badge = spec.required ? s.required : spec.type === "inspection_report" ? s.recommended : s.optional;

          return (
            <li key={spec.type} className={cn("rounded-xl border p-4 md:p-5", complete && "border-emerald-300 dark:border-emerald-800")}>
              <div className="flex items-start gap-3">
                <span aria-hidden className="mt-0.5">
                  {complete ? (
                    <CheckCircle2Icon className="size-6 text-emerald-600" />
                  ) : (
                    <span className="block size-6 rounded-full border-2 border-muted-foreground/40" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium">{label.label}</h2>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{badge}</span>
                    {spec.source === "independent" && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900 dark:bg-sky-950 dark:text-sky-200">
                        {s.independent}
                      </span>
                    )}
                    {complete && <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{s.added}</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{label.hint}</p>

                  {/* Fields that travel with the file */}
                  {canAddMore && (spec.reading || spec.issuer || spec.structured) && (
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                      {spec.reading && (
                        <div className="flex flex-col gap-1.5 sm:w-40">
                          <Label htmlFor={`${spec.type}-reading`}>
                            {s.reading} ({spec.reading.unit})
                          </Label>
                          <Input
                            id={`${spec.type}-reading`}
                            inputMode="decimal"
                            value={readings[spec.type] ?? ""}
                            onChange={(e) => setReadings((r) => ({ ...r, [spec.type]: e.target.value }))}
                            className="h-12 text-base"
                            placeholder={spec.type === "dry_matter" ? "24.5" : "5.5"}
                          />
                        </div>
                      )}
                      {spec.structured && (
                        <>
                          <div className="flex flex-col gap-1.5 sm:w-40">
                            <Label htmlFor={`${spec.type}-sample`}>{s.sampleSize}</Label>
                            <Input
                              id={`${spec.type}-sample`}
                              inputMode="numeric"
                              value={sampleSize}
                              onChange={(e) => setSampleSize(e.target.value)}
                              className="h-12 text-base"
                              placeholder="10"
                            />
                          </div>
                          <div className="flex flex-1 flex-col gap-1.5">
                            <Label htmlFor={`${spec.type}-device`}>{s.device}</Label>
                            <Input
                              id={`${spec.type}-device`}
                              value={device}
                              onChange={(e) => setDevice(e.target.value)}
                              className="h-12 text-base"
                              placeholder={s.devicePlaceholder}
                            />
                          </div>
                        </>
                      )}
                      {spec.issuer && (
                        <div className="flex flex-1 flex-col gap-1.5">
                          <Label htmlFor="issuer">{s.issuer}</Label>
                          <Input
                            id="issuer"
                            value={issuer}
                            onChange={(e) => setIssuer(e.target.value)}
                            className="h-12 text-base"
                            placeholder={s.issuerPlaceholder}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {fieldError[spec.type] && <p className="mt-2 text-sm text-destructive">{fieldError[spec.type]}</p>}

                  {/* Recorded files */}
                  {done.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-2">
                      {done.map((item) => (
                        <li key={item.id} className="flex items-center gap-3 rounded-lg bg-muted/40 p-2">
                          <Thumb src={`/deals/${dealId}/files/${item.id}`} contentType={item.contentType} />
                          <div className="min-w-0 flex-1 text-sm">
                            <p className="truncate font-medium">
                              {item.value ? `${item.value}${spec.reading?.unit ?? ""} · ` : ""}
                              {item.issuer ? `${item.issuer} · ` : ""}
                              {item.fileName}
                            </p>
                            <p className="text-xs text-emerald-700 dark:text-emerald-400">
                              {s.verified} {fmtTimeEAT(new Date(item.receivedAt))}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => remove(item)}
                            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"
                            aria-label={`${s.remove} ${item.fileName}`}
                          >
                            <Trash2Icon className="size-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* In-flight and failed uploads: each file on its own, so one failure doesn't lose the others */}
                  {pending.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-2">
                      {pending.map((u) => (
                        <li key={u.localId} className="flex items-center gap-3 rounded-lg border p-2 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="truncate">{u.fileName}</p>
                            {u.status === "error" ? (
                              <p className="text-xs text-destructive">{u.error}</p>
                            ) : (
                              <div className="mt-1.5 flex items-center gap-2">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                  <div className="h-full bg-primary transition-[width]" style={{ width: `${u.status === "compressing" ? 5 : u.progress}%` }} />
                                </div>
                                <span className="w-20 text-right text-xs text-muted-foreground">
                                  {u.status === "compressing" ? s.compressing : `${s.uploading} ${u.progress}%`}
                                </span>
                              </div>
                            )}
                          </div>
                          {u.status === "error" && (
                            <>
                              <Button type="button" variant="outline" className="h-11 gap-1.5" onClick={() => start(u)}>
                                <RotateCwIcon className="size-4" />
                                {s.retry}
                              </Button>
                              <button
                                type="button"
                                onClick={() => setUploads((us) => us.filter((x) => x.localId !== u.localId))}
                                className="inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                                aria-label={`${s.remove} ${u.fileName}`}
                              >
                                <Trash2Icon className="size-4" />
                              </button>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {spec.multiple && done.length > 0 && done.length < spec.min && (
                    <p className="mt-2 text-sm text-muted-foreground">{s.minPhotos}</p>
                  )}

                  {canAddMore && <Pickers spec={spec} s={s} onPick={(files) => onPick(spec, files)} />}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <BottomBar>
        {!ready && missing.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {s.stillNeeded}: {missing.map((m) => s.items[m].label).join(", ")}
          </p>
        )}
        {!depositPaid && <p className="text-sm text-muted-foreground">{s.savedBeforeDeposit}</p>}
        <Button type="button" className={primaryButton} disabled={!ready || !depositPaid} onClick={() => setConfirming(true)}>
          {s.submit}
        </Button>
      </BottomBar>

      <Sheet open={confirming} onOpenChange={setConfirming}>
        <SheetContent side="bottom" showCloseButton={false} className="mx-auto max-w-lg gap-3 rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:bottom-6 sm:rounded-2xl sm:border">
          <SheetTitle className="text-lg font-semibold">{s.confirmTitle}</SheetTitle>
          <SheetDescription className="text-base">{s.confirmBody.replace("{amount}", balance)}</SheetDescription>
          <form action={lockProof.bind(null, dealId)} className="mt-2 flex flex-col gap-2">
            <SubmitButton>{s.confirm.replace("{amount}", balance.split(" · ")[0])}</SubmitButton>
            <Button type="button" variant="ghost" className="h-12 text-base" onClick={() => setConfirming(false)}>
              {s.cancel}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Pickers({ spec, s, onPick }: { spec: ProofSpec; s: S; onPick: (files: FileList | null) => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const photoOnly = PHOTO_ONLY(spec);
  const reset = (e: React.ChangeEvent<HTMLInputElement>) => {
    onPick(e.target.files);
    e.target.value = ""; // allow picking the same file again after a removal
  };
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={reset} />
      <input ref={picker} type="file" accept={spec.accept} multiple={spec.multiple} className="sr-only" tabIndex={-1} onChange={reset} />
      <Button type="button" variant="outline" className="h-12 gap-2 text-base sm:px-4" onClick={() => camera.current?.click()}>
        <CameraIcon className="size-4" />
        {s.takePhoto}
      </Button>
      <Button type="button" variant="outline" className="h-12 gap-2 text-base sm:px-4" onClick={() => picker.current?.click()}>
        <PaperclipIcon className="size-4" />
        {photoOnly && spec.multiple ? s.addPhotos : s.addFile}
      </Button>
    </div>
  );
}

function Thumb({ src, contentType }: { src: string; contentType: string }) {
  if (contentType.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file route
    return <img src={src} alt="" className="size-12 shrink-0 rounded-md bg-muted object-cover" loading="lazy" />;
  }
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <FileTextIcon className="size-5" />
    </span>
  );
}
