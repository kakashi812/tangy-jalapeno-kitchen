import { Suspense } from 'react';
import { formatKitchenDateTime } from '@fernleaf/shared';
import { apiGet } from '@/lib/api/server';

type Health = { status: string; database: string; kitchenToday: string; serverTime: string };

/** Fetches from the API on the server. While it waits, the Suspense fallback is streamed instead. */
async function ApiStatus() {
  const health = await apiGet<Health>('/health');
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
      <dt className="text-muted-foreground">API</dt>
      <dd>{health.status}</dd>
      <dt className="text-muted-foreground">Database</dt>
      <dd>{health.database}</dd>
      <dt className="text-muted-foreground">Server time (kitchen)</dt>
      <dd>{formatKitchenDateTime(new Date(health.serverTime))}</dd>
    </dl>
  );
}

function ApiStatusSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading system status">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-4 w-64 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}

/** Placeholder until the role dashboards (M12). Shows the streaming pattern every page will use. */
export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Dashboard</h1>
      <section className="max-w-md space-y-3 rounded-lg border p-4">
        <h2 className="font-medium">System status</h2>
        <Suspense fallback={<ApiStatusSkeleton />}>
          <ApiStatus />
        </Suspense>
      </section>
    </div>
  );
}
