import { redirect } from "next/navigation";

// Older links: the adjustment flow replaced the report form.
export default async function ReportRedirect({ params }: PageProps<"/b/[token]/report">) {
  const { token } = await params;
  redirect(`/b/${token}/adjust`);
}
