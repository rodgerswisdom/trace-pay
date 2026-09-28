import { requireExporter } from "@/auth";
import { MobileTopBar, Sidebar } from "@/components/exporter-nav";
import { t } from "@/lib/i18n";
import { container } from "@/lib/layout";
import { navCounts } from "@/lib/portfolio";
import { cn } from "@/lib/utils";
import { signOutAction } from "./actions";

export default async function ExporterLayout({ children }: { children: React.ReactNode }) {
  const exporter = await requireExporter();
  const s = t(exporter.language);
  const counts = await navCounts(exporter.id);
  const nav = {
    s: s.nav,
    counts,
    businessName: exporter.businessName,
    signOutLabel: s.account.signOut,
    signOutAction,
  };

  return (
    <div className="flex flex-1">
      <Sidebar {...nav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar {...nav} />
        <div className={cn(container, "flex flex-1 flex-col pt-4 pb-6 md:pt-8 md:pb-12 print:max-w-none print:p-0")}>{children}</div>
      </div>
    </div>
  );
}
