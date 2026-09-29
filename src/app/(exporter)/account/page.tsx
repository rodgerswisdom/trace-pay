import { requireExporter } from "@/auth";
import { buttonVariants } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { sectionTitle } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { setLanguage, signOutAction } from "../actions";
import Link from "next/link";
import { ChevronRightIcon, PlusIcon, SnowflakeIcon } from "lucide-react";
import { AccountSummary } from "@/components/getting-paid";
import { accountViews } from "@/lib/payouts-server";
import { freezeWithdrawals } from "../getting-paid-actions";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "sw", label: "Kiswahili" },
] as const;

export default async function AccountPage() {
  const exporter = await requireExporter();
  const s = t(exporter.language).account;
  const accounts = await accountViews(exporter.id);
  // Server-rendered once per request; the hold countdown is in whole hours, so it doesn't need to tick.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <main className="flex w-full max-w-2xl flex-1 flex-col gap-6 md:gap-8">
      <h1 className="text-2xl font-semibold md:text-3xl">{s.title}</h1>

      <section>
        <h2 className={sectionTitle}>{s.business}</h2>
        <dl className="divide-y rounded-xl border text-sm md:text-base">
          <Row term={s.business} value={exporter.businessName} />
          <Row term={s.contact} value={[exporter.contactName, exporter.email, exporter.phone].filter(Boolean).join(" · ")} />
        </dl>
      </section>

      <section id="payouts">
        <h2 className={sectionTitle}>Where you get paid</h2>
        {exporter.withdrawalsFrozenAt && (
          <div className="mb-3 flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-center dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <p className="flex-1 text-sm">
              <span className="font-medium">Withdrawals are frozen.</span> Nothing can leave your balance until you unfreeze them.
            </p>
            <Link href="/account/payouts/unfreeze" className={cn(buttonVariants({ variant: "outline" }), "h-11 bg-background px-4")}>
              Unfreeze
            </Link>
          </div>
        )}
        {accounts.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-5">
            <p className="font-medium">No account yet</p>
            <p className="text-sm text-muted-foreground">Add a bank account or M-Pesa number, and withdraw your balance to it whenever you want.</p>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border">
            {accounts.map((a) => (
              <li key={a.id}>
                <Link href={`/account/payouts/${a.id}`} className="flex items-center gap-2 p-4 transition-colors hover:bg-muted/50">
                  <AccountSummary account={a} now={now} />
                  <ChevronRightIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Link href="/account/payouts/new" className={cn(buttonVariants({ variant: accounts.length ? "outline" : "default" }), "h-12 px-5 text-base")}>
            <PlusIcon aria-hidden className="size-4" />
            Add account
          </Link>
          {!exporter.withdrawalsFrozenAt && accounts.length > 0 && (
            <form action={freezeWithdrawals}>
              <button className={cn(buttonVariants({ variant: "ghost" }), "h-12 w-full px-5 text-base text-muted-foreground sm:w-auto")}>
                <SnowflakeIcon aria-hidden className="size-4" />
                Freeze withdrawals
              </button>
            </form>
          )}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">A new account can receive money 24 hours after you add it.</p>
      </section>

      <section>
        <h2 className={sectionTitle}>{s.language}</h2>
        <div role="radiogroup" aria-label={s.language} className="grid grid-cols-2 gap-2 sm:max-w-sm">
          {LANGUAGES.map((l) => {
            const active = exporter.language === l.code;
            return (
              <form key={l.code} action={setLanguage.bind(null, l.code)}>
                <button
                  role="radio"
                  aria-checked={active}
                  className={cn(buttonVariants({ variant: active ? "default" : "outline" }), "h-12 w-full text-base")}
                >
                  {l.label}
                </button>
              </form>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{s.languageHint}</p>
      </section>

      <form action={signOutAction}>
        <button className={cn(buttonVariants({ variant: "outline" }), "h-12 w-full text-base sm:w-auto sm:px-6")}>{s.signOut}</button>
      </form>
    </main>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 p-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="font-medium sm:text-right">{value}</dd>
    </div>
  );
}
