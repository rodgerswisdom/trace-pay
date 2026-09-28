"use server";

import { redirect } from "next/navigation";
import { requireExporter } from "@/auth";
import { ClaimError, respondToClaim } from "@/lib/claims-server";

export type RespondState = { error?: string };

export async function respond(dealId: string, _prev: RespondState, form: FormData): Promise<RespondState> {
  const exporter = await requireExporter();
  try {
    await respondToClaim(exporter.id, dealId, {
      decision: String(form.get("decision") ?? ""),
      counterMajor: Number(String(form.get("counter") ?? "").replace(/,/g, "")),
      note: String(form.get("note") ?? ""),
    });
  } catch (e) {
    if (e instanceof ClaimError) return { error: e.message };
    throw e;
  }
  redirect(`/deals/${dealId}`);
}
