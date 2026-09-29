"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FileTextIcon, PaperclipIcon, Trash2Icon } from "lucide-react";
import { BottomBar, primaryButton } from "@/components/bottom-bar";
import { Button } from "@/components/ui/button";
import type { DEAL_DOCUMENT_TYPES, DealDocument } from "@/db/schema";
import type { strings } from "@/lib/i18n";

 type S = (typeof strings)["en"]["documents"];
type Category = (typeof DEAL_DOCUMENT_TYPES)[number];

type DocumentItem = Pick<DealDocument, "id" | "category" | "fileName" | "contentType" | "sizeBytes" | "uploadedAt" | "lockedAt">;

export function DocumentsUpload({ dealId, s, initial, locked }: { dealId: string; s: S; initial: DocumentItem[]; locked: boolean }) {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [navigating, startNavigation] = useTransition();
  const [category, setCategory] = useState<Category>("quality_certificate");
  const [documents, setDocuments] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("category", category);
    form.set("file", file, file.name);
    const response = await fetch(`/api/deals/${dealId}/documents`, { method: "POST", body: form });
    const body = (await response.json().catch(() => ({}))) as { item?: DocumentItem; error?: string };
    if (response.ok && body.item) setDocuments((items) => [...items, body.item!]);
    else setError(body.error ?? s.failed);
    setBusy(false);
  }

  async function remove(documentId: string) {
    const response = await fetch(`/api/deals/${dealId}/documents/${documentId}`, { method: "DELETE" });
    if (response.ok) setDocuments((items) => items.filter((item) => item.id !== documentId));
  }

  function continueToBuyerLink() {
    if (busy || navigating || locked) return;
    startNavigation(() => router.push(`/deals/${dealId}/share`));
  }

  return (
    <>
      <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">{s.intro}</div>
      <div className="flex flex-col gap-3 rounded-xl border p-4">
        <label className="text-sm font-medium" htmlFor="document-category">{s.categoryHint}</label>
        <select id="document-category" value={category} onChange={(event) => setCategory(event.target.value as Category)} className="h-12 rounded-lg border border-input bg-transparent px-3 text-base">
          {Object.entries(s.categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input
          ref={picker}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
        <Button type="button" variant="outline" className="h-12 gap-2" disabled={busy || locked} onClick={() => picker.current?.click()}>
          <PaperclipIcon className="size-4" />
          {busy ? s.uploading : s.addFile}
        </Button>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      </div>

      {documents.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {documents.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-xl border p-3">
              {item.contentType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element -- private, access-checked route
                <img src={`/deals/${dealId}/documents/${item.id}`} alt="" className="size-14 shrink-0 rounded-md bg-muted object-cover" />
              ) : (
                <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><FileTextIcon className="size-6" /></span>
              )}
              <div className="min-w-0 flex-1">
                <a href={`/deals/${dealId}/documents/${item.id}`} target="_blank" rel="noopener" className="truncate text-sm font-medium hover:underline">{item.fileName}</a>
                <p className="text-xs text-muted-foreground">{s.categories[item.category]} · {(item.sizeBytes / 1024).toFixed(0)} KB</p>
              </div>
              {!locked && <button type="button" onClick={() => void remove(item.id)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={`${s.remove} ${item.fileName}`}><Trash2Icon className="size-4" /></button>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{s.empty}</p>
      )}

      <BottomBar>
        <Button type="button" className={primaryButton} disabled={busy || navigating || locked} aria-busy={navigating} onClick={continueToBuyerLink}>
          {navigating ? "…" : s.continue}
        </Button>
      </BottomBar>
    </>
  );
}
