'use client';

import { Button } from '@/components/ui/button';

/**
 * Shown when a page in the (app) group throws while rendering, e.g. the API is down. Must be a
 * client component (Next.js requirement) so "Try again" can re-render the page.
 * In production Next.js hides server error messages from the browser; the digest links to the log.
 */
export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-md space-y-3 rounded-lg border border-destructive/40 p-4">
      <h2 className="font-medium">This page could not be loaded</h2>
      <p className="text-sm text-muted-foreground">
        {error.message || 'Something went wrong.'}
        {error.digest ? ` (ref ${error.digest})` : null}
      </p>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
