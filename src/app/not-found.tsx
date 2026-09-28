import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-3 px-4 py-16">
      <Logo height={22} />
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link href="/home" className="text-primary underline-offset-4 hover:underline">
        Go to your deals
      </Link>
    </main>
  );
}
