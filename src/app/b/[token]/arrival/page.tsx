import { redirect } from "next/navigation";

// Arrival is handled on the deal page now ("Accept delivery" / "Request an adjustment").
export default async function ArrivalRedirect({ params }: PageProps<"/b/[token]/arrival">) {
  const { token } = await params;
  redirect(`/b/${token}`);
}
