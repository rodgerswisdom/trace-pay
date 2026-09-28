"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Polls a tiny status endpoint and refreshes the page when the deal changes. */
export function LiveRefresh({ url, version, intervalMs = 3000 }: { url: string; version: string; intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const { version: v } = (await res.json()) as { version: string };
        if (!stopped && v !== version) router.refresh();
      } catch {
        // Weak signal: try again next tick.
      }
    };
    const id = setInterval(tick, intervalMs);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [url, version, intervalMs, router]);

  return null;
}
