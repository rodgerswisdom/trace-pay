// Shown while an exporter screen loads (weak signal): a quiet skeleton, not a spinner.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex animate-pulse flex-col gap-4">
      <div className="h-8 w-48 rounded-lg bg-muted" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-24 rounded-xl bg-muted" />
        <div className="h-24 rounded-xl bg-muted" />
        <div className="h-24 rounded-xl bg-muted" />
      </div>
      <div className="h-40 rounded-xl bg-muted" />
    </div>
  );
}
