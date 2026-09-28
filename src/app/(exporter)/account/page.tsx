import { requireExporter } from "@/auth";
import { buttonVariants } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { sectionTitle } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { setLanguage, signOutAction } from "../actions";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "sw", label: "Kiswahili" },
] as const;

export default async function AccountPage() {
  const exporter = await requireExporter();
  const s = t(exporter.language).account;

  return (
    <main className="flex w-full max-w-2xl flex-1 flex-col gap-6 md:gap-8">
      <h1 className="text-2xl font-semibold md:text-3xl">{s.title}</h1>

      <section>
        <h2 className={sectionTitle}>{s.business}</h2>
        <dl className="divide-y rounded-xl border text-sm md:text-base">
          <Row term={s.business} value={exporter.businessName} />
          <Row term={s.contact} value={[exporter.contactName, exporter.email, exporter.phone].filter(Boolean).join(" · ")} />
          <Row
            term={s.settlement}
            value={exporter.settlementBank ? `${exporter.settlementBank} ${exporter.settlementAccount ?? ""}`.trim() : s.notSet}
          />
        </dl>
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
