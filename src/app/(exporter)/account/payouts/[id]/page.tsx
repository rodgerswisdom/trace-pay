import { notFound } from "next/navigation";
import { requireExporter } from "@/auth";
import { accountViews } from "@/lib/payouts-server";
import { ManageAccount } from "./manage-account";

export default async function PayoutAccountPage({ params }: PageProps<"/account/payouts/[id]">) {
  const exporter = await requireExporter();
  const { id } = await params;
  const accounts = await accountViews(exporter.id);
  const account = accounts.find((a) => a.id === id);
  if (!account) notFound();
  return <ManageAccount account={account} onlyAccount={accounts.length === 1} />;
}
