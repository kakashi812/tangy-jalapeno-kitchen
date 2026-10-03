/** Shown instantly while a page in the (app) group renders on the server; the shell stays visible. */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-48 animate-pulse rounded bg-muted" />
      <div className="h-32 w-full max-w-md animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
