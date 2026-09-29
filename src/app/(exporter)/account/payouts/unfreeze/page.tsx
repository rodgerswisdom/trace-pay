import { redirect } from "next/navigation";
import { requireExporter } from "@/auth";
import { UnfreezeFlow } from "./unfreeze-flow";

export default async function UnfreezePage() {
  const exporter = await requireExporter();
  if (!exporter.withdrawalsFrozenAt) redirect("/account#payouts");
  return <UnfreezeFlow />;
}
