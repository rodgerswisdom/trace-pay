import { Logo } from "@/components/logo";

export default function DealLinkNotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-3 px-4 py-16">
      <Logo height={22} />
      <h1 className="text-2xl font-semibold">This deal link doesn&apos;t work</h1>
      <p className="text-muted-foreground">Check you have the full link from the exporter, or ask them to send it again.</p>
    </main>
  );
}
