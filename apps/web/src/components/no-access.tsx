/** Shown when a signed-in user opens a page their role doesn't include. */
export function NoAccess() {
  return (
    <div className="max-w-md space-y-2 rounded-lg border p-4">
      <h1 className="font-heading text-xl font-bold">No access</h1>
      <p className="text-sm text-muted-foreground">
        Your role doesn&apos;t include this page. Ask an admin if you need it.
      </p>
    </div>
  );
}
