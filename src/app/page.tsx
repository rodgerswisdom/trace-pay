import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import heroImage from "../../public/images/hero-packhouse.jpg";
import { CheckCircle2Icon, ClipboardCheckIcon, HandshakeIcon, WalletIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { container } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "TRACE Pay · Ship with proof. Get paid in full.",
  description: "Agree the quality terms before you ship. Buyers pay through Payaza. You receive shillings.",
};

const STEPS = [
  { icon: HandshakeIcon, title: "Agree", body: "Price, deposit and quality terms, accepted when the buyer pays." },
  { icon: ClipboardCheckIcon, title: "Prove", body: "Dry matter, inspection and loading, recorded before the fruit leaves." },
  { icon: WalletIcon, title: "Get paid", body: "Withdraw to your bank or M-Pesa in KES, whenever you want." },
];

export default function LandingPage() {
  const cta = cn(buttonVariants(), "h-12 px-6 text-base");
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className={cn(container, "flex h-14 items-center justify-between md:h-16")}>
          <Logo height={26} priority />
          <Link href="/login" className="inline-flex h-11 items-center px-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* 1. Hero: on phones the text comes first and the photo follows; from md up the photo fills the
            section and the text sits over its pale left side. */}
        <section className="relative overflow-hidden md:min-h-[34rem] lg:min-h-[40rem]">
          {/* The photo takes the right 60%, so the headline never covers the "Paid in full" phone */}
          <div className="absolute inset-y-0 right-0 hidden w-[62%] md:block lg:w-[60%]">
            <Image
              src={heroImage}
              alt="An exporter at a packhouse holding a crate of Hass avocados and a phone showing Paid in full"
              priority
              placeholder="blur"
              sizes="(min-width: 1024px) 60vw, 62vw"
              className="h-full w-full object-cover object-[35%_center]"
            />
            {/* Blends the photo's left edge into the page */}
            <div aria-hidden className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-white to-transparent" />
          </div>
          <div className={cn(container, "relative flex flex-col items-start gap-5 py-12 md:min-h-[34rem] md:justify-center md:py-20 lg:min-h-[40rem]")}>
            <h1 className="text-4xl leading-[1.1] font-semibold tracking-tight lg:text-[3.5rem] xl:text-6xl">
              <span className="block whitespace-nowrap">Ship with proof.</span>
              <span className="block whitespace-nowrap">Get paid in full.</span>
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground md:max-w-[36%] md:text-xl lg:max-w-[34%]">
              Agree the quality terms before you ship. Buyers pay through Payaza. You receive shillings.
            </p>
            <Link href="/deals/new" className={cn(cta, "w-full sm:w-auto")}>
              Start a deal
            </Link>
          </div>
          <Image
            src={heroImage}
            alt="An exporter at a packhouse holding a crate of Hass avocados and a phone showing Paid in full"
            priority
            placeholder="blur"
            sizes="100vw"
            className="aspect-[4/3] w-full object-cover object-[62%_center] md:hidden"
          />
        </section>

        {/* 2. How it works */}
        <section className="border-y bg-muted/30">
          <div className={cn(container, "py-12 md:py-16")}>
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">How it works</h2>
            <ol className="mt-6 grid gap-4 md:grid-cols-3 md:gap-6">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex flex-col gap-3 rounded-xl border bg-background p-5 md:p-6">
                  <span className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <step.icon aria-hidden className="size-5" />
                    </span>
                    <span className="text-sm text-muted-foreground">Step {i + 1}</span>
                  </span>
                  <h3 className="text-xl font-semibold">{step.title}</h3>
                  <p className="text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 3. The claim */}
        <section className={cn(container, "grid items-center gap-10 py-12 md:grid-cols-2 md:py-20 lg:gap-16")}>
          <div className="flex flex-col gap-4">
            <h2 className="text-3xl leading-tight font-semibold tracking-tight md:text-4xl">Buyer says the fruit was bad?</h2>
            <p className="text-lg text-muted-foreground md:text-xl">The agreed terms and your evidence settle it, not their word.</p>
          </div>
          <CheckPreview />
        </section>

        <section className={cn(container, "flex flex-col items-start gap-4 pb-16 md:items-center md:pb-24 md:text-center")}>
          <p className="text-xl font-semibold md:text-2xl">Your next shipment, paid in full.</p>
          <Link href="/deals/new" className={cn(cta, "w-full sm:w-auto")}>
            Start a deal
          </Link>
        </section>
      </main>

      <footer className="border-t">
        <div className={cn(container, "flex flex-col gap-1 py-6 text-sm text-muted-foreground sm:flex-row sm:justify-between")}>
          <span>TRACE Pay · for avocado exporters in Kenya</span>
          <span>Payments processed by Payaza</span>
        </div>
      </footer>
    </div>
  );
}

/** An illustration of the check: each record against the agreed term. */
function CheckPreview() {
  const rows = [
    { stage: "At dispatch", source: "Recorded by exporter", value: "24.6%" },
    { stage: "In transit", source: "Container tracker", value: "5.2–6.5 °C" },
    { stage: "At arrival", source: "Independent", value: "24.1%" },
  ];
  return (
    <div aria-hidden className="rounded-2xl border bg-background p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">Agreed: dry matter at least 23%, kept at 4.5–7 °C</p>
      <ul className="mt-3 divide-y">
        {rows.map((r) => (
          <li key={r.stage} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.stage}</p>
              <p className="text-xs text-muted-foreground">{r.source}</p>
            </div>
            <span className="tabular-nums">{r.value}</span>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2Icon className="size-4" />
              Meets term
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-lg bg-muted/50 p-3 text-sm font-medium">Balance stays as agreed.</p>
    </div>
  );
}
