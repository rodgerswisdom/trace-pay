import { redirect } from "next/navigation";

// Quality issues are reported with the arrival reading now.
export default async function ReportRedirect({ params }: PageProps<"/b/[token]/report">) {
  const { token } = await params;
  redirect(`/b/${token}/arrival?issue=1`);
}
