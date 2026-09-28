export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="mx-auto flex w-full max-w-6xl animate-pulse flex-col gap-4 px-4 pt-16 md:px-8">
      <div className="h-8 w-56 rounded-lg bg-muted" />
      <div className="h-48 rounded-xl bg-muted" />
      <div className="h-24 rounded-xl bg-muted" />
    </div>
  );
}
