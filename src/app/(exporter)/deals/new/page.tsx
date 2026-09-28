import Link from "next/link";
import { requireExporter } from "@/auth";
import { t } from "@/lib/i18n";
import { CURRENCIES, kesRate } from "@/lib/money";
import { NewDealForm } from "./new-deal-form";

export default async function NewDealPage() {
  const exporter = await requireExporter();
  const s = t(exporter.language);
  const rates = Object.fromEntries(CURRENCIES.map((c) => [c, kesRate(c)]));

  return (
    <main className="flex flex-1 flex-col">
      <Link href="/deals" className="-mt-2 -ml-1 flex h-11 w-fit items-center px-1 text-sm text-muted-foreground hover:text-foreground">
        ← {exporter.language === "sw" ? "Mikataba" : "Deals"}
      </Link>
      <h1 className="mb-5 text-2xl font-semibold md:mb-8 md:text-3xl">{s.newDeal.title}</h1>
      <NewDealForm s={s.newDeal} currencies={CURRENCIES} rates={rates} />
    </main>
  );
}
