import { requireExporter } from "@/auth";
import { AddAccountFlow } from "./add-account-flow";

export default async function AddAccountPage({ searchParams }: PageProps<"/account/payouts/new">) {
  await requireExporter();
  const { next } = await searchParams;
  const fromWithdraw = next === "withdraw";
  return (
    <AddAccountFlow
      backHref={fromWithdraw ? "/withdraw" : "/account#payouts"}
      nextHref={fromWithdraw ? "/withdraw" : "/account#payouts"}
      nextLabel={fromWithdraw ? "Back to withdraw" : "Done"}
    />
  );
}
