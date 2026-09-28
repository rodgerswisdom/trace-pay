"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConicalIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Attach the tracker export (once). The server parses and fingerprints it. */
export function TransitAttach({ dealId, labels }: { dealId: string; labels: { attach: string; sample: string; hint: string } }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/transit`, { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(body.error ?? "Upload failed. Try again.");
      else router.refresh();
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed p-4 md:p-5">
      <p className="text-sm text-muted-foreground">{labels.hint}</p>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const form = new FormData();
          form.set("file", f, f.name);
          send(form);
        }}
      />
      <div className="grid gap-2 sm:flex">
        <Button type="button" className="h-12 gap-2 text-base sm:h-10 sm:text-sm" disabled={busy} onClick={() => input.current?.click()}>
          <UploadIcon className="size-4" />
          {busy ? "…" : labels.attach}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-12 gap-2 text-base sm:h-10 sm:text-sm"
          disabled={busy}
          onClick={() => {
            const form = new FormData();
            form.set("sample", "1");
            send(form);
          }}
        >
          <FlaskConicalIcon className="size-4" />
          {labels.sample}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
