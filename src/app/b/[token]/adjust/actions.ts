"use server";

import { redirect } from "next/navigation";
import { ClaimError, acceptDelivery, requestAdjustment, withdrawAdjustment, type AdjustmentInput } from "@/lib/claims-server";

export async function sendAdjustment(token: string, input: AdjustmentInput): Promise<{ error: string } | undefined> {
  try {
    await requestAdjustment(token, input);
  } catch (e) {
    if (e instanceof ClaimError) return { error: e.message };
    throw e;
  }
  redirect(`/b/${token}?adjustment=sent`);
}

export async function acceptDeliveryAction(token: string) {
  try {
    await acceptDelivery(token);
  } catch (e) {
    if (e instanceof ClaimError) redirect(`/b/${token}?notice=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect(`/b/${token}?delivery=accepted`);
}

export async function withdrawAction(token: string) {
  try {
    await withdrawAdjustment(token);
  } catch (e) {
    if (e instanceof ClaimError) redirect(`/b/${token}?notice=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect(`/b/${token}?adjustment=withdrawn`);
}
