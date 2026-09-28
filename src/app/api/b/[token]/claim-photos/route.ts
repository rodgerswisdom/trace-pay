import { ClaimError, uploadClaimPhoto } from "@/lib/claims-server";

// One photo per request, so a weak connection only ever retries one file.
export async function POST(req: Request, { params }: RouteContext<"/api/b/[token]/claim-photos">) {
  const { token } = await params;
  try {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return Response.json({ error: "No photo received" }, { status: 400 });
    return Response.json({ key: await uploadClaimPhoto(token, file) });
  } catch (e) {
    if (e instanceof ClaimError) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
}
