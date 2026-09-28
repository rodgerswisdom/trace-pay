import { redirect } from "next/navigation";
import { handleCallback } from "@/lib/callback";

// Payaza's hosted payment page sends the buyer back here after a successful payment (it adds no status
// of its own, so our reference is in the URL). Confirm with Payaza, then show the deal.
export async function GET(req: Request, { params }: RouteContext<"/b/[token]/callback">) {
  const { token } = await params;
  const ref = new URL(req.url).searchParams.get("ref") ?? "";
  const { result, kind } = await handleCallback(token, ref);
  if (result === "paid") redirect(`/b/${token}?paid=${kind}`);
  if (result === "pending" || result === "mismatch") redirect(`/b/${token}?returned=${kind}`);
  if (result === "failed") redirect(`/b/${token}?payment=failed`);
  redirect(`/b/${token}`);
}
