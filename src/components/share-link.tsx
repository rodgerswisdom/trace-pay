"use client";

import { useState, useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";

const noop = () => () => {};

export function ShareLink({
  url,
  title,
  labels,
}: {
  url: string;
  title: string;
  labels: { copy: string; copied: string; share: string; qr: string };
}) {
  const [copied, setCopied] = useState(false);
  const canShare = useSyncExternalStore(noop, () => "share" in navigator, () => false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. http on a phone): the link is selectable in the box.
    }
  }

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-10">
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={copy}
          className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-left font-mono text-sm break-all select-all"
        >
          {url}
        </button>
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="outline" className="h-12 text-base" onClick={copy}>
            {copied ? labels.copied : labels.copy}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 text-base"
            disabled={!canShare}
            onClick={() => navigator.share({ title, url }).catch(() => {})}
          >
            {labels.share}
          </Button>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 pt-2 md:rounded-xl md:border md:p-5 md:pt-4">
        <p className="text-sm text-muted-foreground">{labels.qr}</p>
        <div className="rounded-xl bg-white p-3">
          <QRCodeSVG value={url} size={200} marginSize={0} />
        </div>
      </div>
    </div>
  );
}
