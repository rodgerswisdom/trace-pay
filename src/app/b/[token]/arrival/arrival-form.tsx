"use client";

import { useActionState, useState } from "react";
import imageCompression from "browser-image-compression";
import { CameraIcon, PaperclipIcon, RotateCwIcon, Trash2Icon } from "lucide-react";
import { BottomBar, primaryButton } from "@/components/bottom-bar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_CLAIM_PHOTOS } from "@/lib/claims";
import { cn } from "@/lib/utils";
import { sendArrival, type ArrivalState } from "./actions";

const REASONS = [
  { value: "immature", label: "Immature fruit" },
  { value: "overripe_damaged", label: "Overripe or damaged" },
  { value: "underweight", label: "Underweight" },
  { value: "other", label: "Other" },
];

type Photo = { id: string; name: string; preview: string; file: File; status: "uploading" | "done" | "error"; key?: string; error?: string };

const inputClass =
  "h-12 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function ArrivalForm({
  token,
  currency,
  startWithIssue,
  hold,
  finalOnArrival,
}: {
  token: string;
  currency: string;
  startWithIssue: boolean;
  hold: { label: string; amount: number };
  /** The final payment this confirmation will request, if any. */
  finalOnArrival: string | null;
}) {
  const [state, action, pending] = useActionState<ArrivalState, FormData>(sendArrival.bind(null, token), {});
  const v = state.values ?? {};
  const [hasIssue, setHasIssue] = useState(startWithIssue);
  const [reason, setReason] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const busy = photos.some((p) => p.status === "uploading");
  const patch = (id: string, p: Partial<Photo>) => setPhotos((ps) => ps.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const k = (name: string) => `${name}-${v[name] ?? ""}`; // re-seed uncontrolled fields after a validation error

  async function upload(photo: Photo) {
    patch(photo.id, { status: "uploading", error: undefined });
    let file = photo.file;
    try {
      const out = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 2048, useWebWorker: true, initialQuality: 0.8 });
      file = new File([out], file.name, { type: out.type || file.type });
    } catch {}
    const form = new FormData();
    form.set("file", file, file.name);
    try {
      const res = await fetch(`/api/b/${token}/claim-photos`, { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { key?: string; error?: string };
      if (res.ok && body.key) patch(photo.id, { status: "done", key: body.key });
      else patch(photo.id, { status: "error", error: body.error ?? "Upload failed" });
    } catch {
      patch(photo.id, { status: "error", error: "Upload failed" });
    }
  }

  function add(files: FileList | null) {
    if (!files) return;
    const next = [...files].slice(0, MAX_CLAIM_PHOTOS - photos.length).map<Photo>((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      preview: URL.createObjectURL(file),
      file,
      status: "uploading",
    }));
    setPhotos((ps) => [...ps, ...next]);
    next.forEach(upload);
  }

  const submitLabel = hasIssue ? "Confirm arrival and send report" : finalOnArrival ? `Confirm arrival · final payment ${finalOnArrival}` : "Confirm arrival";

  return (
    <form action={action} className="flex flex-col gap-6">
      <fieldset>
        <legend className="mb-3 font-semibold">Your test on arrival</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dryMatterPct">Dry matter (%)</Label>
            <input id="dryMatterPct" name="dryMatterPct" inputMode="decimal" required placeholder="24.1" defaultValue={v.dryMatterPct} key={k("dryMatterPct")} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sampleSize">Sample size (fruit)</Label>
            <input id="sampleSize" name="sampleSize" inputMode="numeric" required placeholder="10" defaultValue={v.sampleSize} key={k("sampleSize")} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="device">Device or method</Label>
            <input id="device" name="device" required placeholder="e.g. F-750 NIR meter or oven method" defaultValue={v.device} key={k("device")} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pulpTempC">Pulp temperature (°C, optional)</Label>
            <input id="pulpTempC" name="pulpTempC" inputMode="decimal" placeholder="6.0" defaultValue={v.pulpTempC} key={k("pulpTempC")} className={inputClass} />
          </div>
        </div>
      </fieldset>

      <div>
        <p id="condition-label" className="mb-2 font-semibold">
          How is the fruit?
        </p>
        <input type="hidden" name="hasIssue" value={hasIssue ? "1" : "0"} />
        <div role="radiogroup" aria-labelledby="condition-label" className="grid grid-cols-2 gap-2">
          {[
            { value: false, label: "It's fine" },
            { value: true, label: "There's a quality issue" },
          ].map((o) => (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={hasIssue === o.value}
              onClick={() => setHasIssue(o.value)}
              className={cn(
                "flex h-12 items-center justify-center rounded-lg border px-3 text-center text-sm font-medium transition-colors",
                hasIssue === o.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {hasIssue && (
        <div className="flex flex-col gap-6 rounded-xl border p-4 md:p-5">
          <div>
            <p id="reason-label" className="mb-2 font-medium">
              What&apos;s wrong?
            </p>
            {/* Buttons + hidden field rather than radio inputs: survives the form reset after a validation error. */}
            <input type="hidden" name="reason" value={reason} />
            <div role="radiogroup" aria-labelledby="reason-label" className="grid grid-cols-2 gap-2">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  role="radio"
                  aria-checked={reason === r.value}
                  onClick={() => setReason(r.value)}
                  className={cn(
                    "flex h-12 items-center justify-center rounded-lg border px-3 text-center text-sm font-medium transition-colors",
                    reason === r.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Describe the issue</Label>
            <Textarea
              id="description"
              name="description"
              rows={4}
              className="text-base"
              defaultValue={v.description}
              key={k("description")}
              placeholder="What did you find, how many cartons, when did the fruit arrive?"
            />
          </div>

          <div>
            <p className="mb-2 font-medium">Photos</p>
            {photos.length > 0 && (
              <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((p) => (
                  <li key={p.id} className="relative overflow-hidden rounded-lg border">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                    <img src={p.preview} alt="" className="aspect-square w-full object-cover" />
                    {p.key && <input type="hidden" name="photoKey" value={p.key} />}
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-background/90 p-1 text-xs">
                      <span className={cn(p.status === "error" && "text-destructive", p.status === "done" && "text-emerald-700 dark:text-emerald-400")}>
                        {p.status === "uploading" ? "Uploading…" : p.status === "done" ? "Added" : "Failed"}
                      </span>
                      <span className="flex">
                        {p.status === "error" && (
                          <button type="button" onClick={() => upload(p)} className="inline-flex size-9 items-center justify-center rounded" aria-label={`Retry ${p.name}`}>
                            <RotateCwIcon className="size-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => (URL.revokeObjectURL(p.preview), setPhotos((ps) => ps.filter((x) => x.id !== p.id)))}
                          className="inline-flex size-9 items-center justify-center rounded"
                          aria-label={`Remove ${p.name}`}
                        >
                          <Trash2Icon className="size-4" />
                        </button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {photos.length < MAX_CLAIM_PHOTOS && (
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <label className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 text-base font-medium hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
                  <CameraIcon className="size-4" />
                  Take photo
                  <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
                </label>
                <label className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 text-base font-medium hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
                  <PaperclipIcon className="size-4" />
                  Add photos
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
                </label>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="amount">Amount to take off ({currency})</Label>
            <input id="amount" name="amount" inputMode="decimal" placeholder="1000" defaultValue={v.amount} key={k("amount")} className={inputClass} />
            <p className="text-xs text-muted-foreground">
              Less than the {hold.label} of {currency} {(hold.amount / 100).toLocaleString("en-US")}, which stays on hold until you both agree.
            </p>
          </div>
        </div>
      )}

      {state.error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <BottomBar className="md:max-w-sm">
        {hasIssue && !reason && <p className="text-sm text-muted-foreground">Pick what&apos;s wrong to continue.</p>}
        <Button type="submit" className={primaryButton} disabled={pending || busy || (hasIssue && !reason)}>
          {pending ? "Sending…" : busy ? "Uploading photos…" : submitLabel}
        </Button>
      </BottomBar>
    </form>
  );
}
