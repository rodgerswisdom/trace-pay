import { handleCallback } from "@/lib/callback";

// Payaza's inline checkout callback, forwarded by the buyer's browser. Only a trigger: the payment is
// confirmed with Payaza on our side before anything is marked paid.
export async function POST(req: Request, { params }: RouteContext<"/api/b/[token]/callback">) {
  const { token } = await params;
  const body = (await req.json().catch(() => ({}))) as { reference?: string };
  const { result } = await handleCallback(token, String(body.reference ?? ""));
  return Response.json({ result }, { status: result === "not_found" ? 404 : 200 });
}
