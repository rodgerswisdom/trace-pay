"use server";

import { redirect } from "next/navigation";
import { ClaimError, confirmArrival } from "@/lib/claims-server";

export type ArrivalState = { error?: string; values?: Record<string, string> };

const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(",", ".").trim());

export async function sendArrival(token: string, _prev: ArrivalState, form: FormData): Promise<ArrivalState> {
  const issue = form.get("hasIssue") === "1";
  const pulp = String(form.get("pulpTempC") ?? "").trim();
  let result;
  try {
    result = await confirmArrival(token, {
      dryMatterPct: num(form.get("dryMatterPct")),
      sampleSize: num(form.get("sampleSize")),
      device: String(form.get("device") ?? ""),
      pulpTempC: pulp ? num(pulp) : null,
      notes: String(form.get("notes") ?? ""),
      issue: issue
        ? {
            reason: String(form.get("reason") ?? ""),
            description: String(form.get("description") ?? ""),
            amountMajor: num(String(form.get("amount") ?? "").replace(/,/g, "")),
            photoKeys: form.getAll("photoKey").map(String),
          }
        : null,
    });
  } catch (e) {
    if (e instanceof ClaimError) {
      const values = Object.fromEntries(
        ["dryMatterPct", "sampleSize", "device", "pulpTempC", "notes", "description", "amount"].map((k) => [k, String(form.get(k) ?? "")]),
      );
      return { error: e.message, values };
    }
    throw e;
  }
  redirect(`/b/${token}?${result.claimed ? "claim=sent" : "arrival=confirmed"}`);
}
