import { auth } from "@/auth";
import { TransitError, attachTransitLog } from "@/lib/transit-server";

export async function POST(req: Request, { params }: RouteContext<"/api/deals/[id]/transit">) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Sign in again" }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (form.get("sample") === "1") await attachTransitLog(session.user.id, id, { sample: true });
    else if (file instanceof File) await attachTransitLog(session.user.id, id, { file });
    else return Response.json({ error: "No file received" }, { status: 400 });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof TransitError) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
