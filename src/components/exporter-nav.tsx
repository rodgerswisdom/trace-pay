"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileTextIcon,
  HouseIcon,
  LogOutIcon,
  MenuIcon,
  MessageSquareWarningIcon,
  PlusIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
  XIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { buttonVariants } from "@/components/ui/button";
import type { strings } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";

type NavStrings = (typeof strings)["en"]["nav"];
type Counts = { needsYou: number; openClaims: number };

type SidebarProps = {
  s: NavStrings;
  counts: Counts;
  businessName: string;
  signOutLabel: string;
  signOutAction: () => Promise<void>;
};

const TABS = [
  { key: "home", href: "/home", icon: HouseIcon },
  { key: "deals", href: "/deals", icon: FileTextIcon },
  { key: "payments", href: "/payments", icon: WalletIcon },
  { key: "claims", href: "/claims", icon: MessageSquareWarningIcon },
  { key: "buyers", href: "/buyers", icon: UsersIcon },
] as const;
type TabKey = (typeof TABS)[number]["key"] | "account";

function activeTab(pathname: string): TabKey | null {
  for (const t of TABS) if (pathname === t.href || pathname.startsWith(`${t.href}/`)) return t.key;
  if (pathname.startsWith("/account")) return "account";
  if (pathname.startsWith("/withdraw")) return "home";
  return null;
}

function Badge({ count, label, tone }: { count: number; label: string; tone: "red" | "muted" }) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "ml-auto inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold",
        tone === "red" ? "bg-red-600 text-white" : "bg-muted text-foreground",
      )}
    >
      {count}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  onNavigate,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onNavigate?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-12 items-center gap-3 rounded-lg px-3 text-base font-medium transition-colors lg:h-10 lg:text-sm",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-5 shrink-0 lg:size-4" />
      <span className="truncate">{label}</span>
      {children}
    </Link>
  );
}

/** The sidebar body, shared by the fixed desktop sidebar and the phone/tablet side panel. */
function SidebarBody({ s, counts, businessName, signOutLabel, signOutAction, onNavigate }: SidebarProps & { onNavigate?: () => void }) {
  const current = activeTab(usePathname());
  return (
    <>
      <div className="px-3 pt-2 pb-4">
        <Link href="/deals/new" onClick={onNavigate} className={cn(buttonVariants(), "h-12 w-full gap-2 text-base lg:h-10 lg:text-sm")}>
          <PlusIcon className="size-4" />
          {s.newDeal}
        </Link>
      </div>
      <nav aria-label="Main" className="flex flex-col gap-1 px-3">
        {TABS.map((tab) => (
          <NavItem key={tab.key} href={tab.href} icon={tab.icon} label={s[tab.key]} active={current === tab.key} onNavigate={onNavigate}>
            {tab.key === "deals" && <Badge count={counts.needsYou} label={s.needsYou} tone="red" />}
            {tab.key === "claims" && <Badge count={counts.openClaims} label={s.open} tone="red" />}
          </NavItem>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-1 border-t px-3 py-3">
        <NavItem href="/account" icon={UserIcon} label={s.account} active={current === "account"} onNavigate={onNavigate}>
          <span className="sr-only">· {businessName}</span>
        </NavItem>
        <form action={signOutAction}>
          <button className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-base font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:h-10 lg:text-sm">
            <LogOutIcon className="size-5 lg:size-4" />
            {signOutLabel}
          </button>
        </form>
      </div>
    </>
  );
}

function Brand({ businessName }: { businessName: string }) {
  return (
    <Link href="/home" className="flex min-w-0 flex-col items-start gap-1 leading-tight">
      <Logo height={26} priority />
      <span className="truncate text-xs text-muted-foreground">{businessName}</span>
    </Link>
  );
}

/** Large screens: a fixed sidebar with the tabs. */
export function Sidebar(props: SidebarProps) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-muted/30 lg:flex print:hidden">
      <div className="flex h-16 items-center px-6">
        <Brand businessName={props.businessName} />
      </div>
      <SidebarBody {...props} />
    </aside>
  );
}

/**
 * Phones and tablets: a top bar with a menu button that slides the same sidebar in.
 * The bottom of the screen stays free for each screen's primary action.
 */
export function MobileTopBar(props: SidebarProps) {
  const [open, setOpen] = useState(false);
  const attention = props.counts.needsYou + props.counts.openClaims > 0;

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur lg:hidden print:hidden">
      <div className="flex h-14 items-center justify-between gap-3 px-4 md:h-16 md:px-8">
        <Brand businessName={props.businessName} />
        <div className="flex items-center gap-2">
          <Link href="/deals/new" className={cn(buttonVariants(), "hidden h-10 gap-1.5 px-4 md:inline-flex")}>
            <PlusIcon className="size-4" />
            {props.s.newDeal}
          </Link>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="relative inline-flex size-11 items-center justify-center rounded-lg hover:bg-muted" aria-label={props.s.menu}>
              <MenuIcon className="size-6" />
              {attention && <span aria-hidden className="absolute top-2 right-2 size-2.5 rounded-full bg-red-600 ring-2 ring-background" />}
            </SheetTrigger>
            <SheetContent side="left" showCloseButton={false} className="w-[85%] max-w-xs gap-0 p-0">
              <div className="flex items-center justify-between border-b py-2 pr-2 pl-4">
                <div className="min-w-0">
                  <SheetTitle>
                    <Logo height={20} />
                  </SheetTitle>
                  <p className="truncate text-xs text-muted-foreground">{props.businessName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-muted"
                  aria-label={props.s.closeMenu}
                >
                  <XIcon className="size-5" />
                </button>
              </div>
              <div className="flex flex-1 flex-col pt-3">
                <SidebarBody {...props} onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
