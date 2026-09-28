import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-3 px-4 py-16">
      <p className="text-sm font-semibold tracking-wide text-primary">TRACE Pay</p>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link href="/home" className="text-primary underline-offset-4 hover:underline">
        Go to your deals
      </Link>
    </main>
  );
}
