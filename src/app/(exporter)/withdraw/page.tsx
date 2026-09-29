import Link from "next/link";
import { requireExporter } from "@/auth";
import { FlowHeader } from "@/components/flow-header";
import { buttonVariants } from "@/components/ui/button";
import { primaryButton } from "@/components/bottom-bar";
import { fmt } from "@/lib/money";
import { accountViews, feeKesMinor, loadBalances, payoutMode } from "@/lib/payouts-server";
import { loadPortfolio, outstanding } from "@/lib/portfolio";
import { cn } from "@/lib/utils";
import { WithdrawFlow } from "./withdraw-flow";

export default async function WithdrawPage() {
  const exporter = await requireExporter();
  const [balances, accounts] = await Promise.all([loadBalances(exporter.id), accountViews(exporter.id)]);
  const mode = payoutMode();
  const available = balances.filter((b) => b.availableMinor > 0);

  let blocked: { title: string; body: string; href: string; cta: string } | null = null;
  if (exporter.withdrawalsFrozenAt) {
    blocked = { title: "Withdrawals are frozen", body: "Nothing can leave your balance until you unfreeze them.", href: "/account/payouts/unfreeze", cta: "Unfreeze" };
  } else if (mode === "paused") {
    blocked = { title: "Withdrawals are paused", body: "Payaza isn't taking withdrawals right now. Your balance is safe; try again later.", href: "/home", cta: "Back to Home" };
  } else if (accounts.length === 0) {
    blocked = {
      title: "Where should we send it?",
      body: "Add a bank account or M-Pesa number first. For your safety, a new account can receive money 24 hours after you add it.",
      href: "/account/payouts/new?next=withdraw",
      cta: "Add account",
    };
  } else if (available.length === 0) {
    const portfolio = await loadPortfolio(exporter.id);
    const incoming = new Map<string, number>();
    for (const d of portfolio) if (outstanding(d) > 0) incoming.set(d.currency, (incoming.get(d.currency) ?? 0) + outstanding(d));
    const list = [...incoming].map(([c, v]) => fmt(v, c)).join(" · ");
    blocked = {
      title: "Nothing to withdraw yet",
      body: list ? `${list} is expected from buyers. It lands in your balance when they pay.` : "Payments from buyers land in your balance.",
      href: "/home",
      cta: "Back to Home",
    };
  }

  if (blocked) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <FlowHeader title="Withdraw" steps={[]} step={-1} backHref="/home" />
        <h2 className="text-2xl font-semibold">{blocked.title}</h2>
        <p className="text-muted-foreground">{blocked.body}</p>
        <Link href={blocked.href} className={cn(buttonVariants(), primaryButton, "sm:w-auto sm:px-6")}>
          {blocked.cta}
        </Link>
      </div>
    );
  }

  return <WithdrawFlow balances={available} accounts={accounts} feeKesMinor={feeKesMinor()} practice={mode === "practice"} />;
}
