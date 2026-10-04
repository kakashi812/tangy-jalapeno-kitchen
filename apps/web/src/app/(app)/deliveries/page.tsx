import { Suspense } from 'react';
import {
  PageQuerySchema,
  formatKitchenDate,
  kitchenToday,
  type DropSummary,
  type Paginated,
} from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { DropCard } from '../dispatch/drop-card';
import { RefreshDrops } from '../dispatch/drop-actions';
async function Content({ page }: { page?: string }) {
  const parsed = PageQuerySchema.safeParse({ page }),
    query = parsed.success ? parsed.data : PageQuerySchema.parse({});
  const data = await apiGet<Paginated<DropSummary>>(`/deliveries?page=${query.page}`);
  return (
    <>
      <RefreshDrops />
      <div className="space-y-4">
        {data.items.map((drop) => (
          <DropCard key={drop.id} drop={drop} />
        ))}
      </div>
      {!data.items.length && (
        <p className="rounded-lg border p-6 text-muted-foreground">
          No deliveries are assigned to you today. Ask Dispatch if you expected a drop. Closed days
          can correctly be empty.
        </p>
      )}
      <Pagination pathname="/deliveries" params={{}} {...data} />
    </>
  );
}
export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await getSessionUser();
  if (!can(user, 'deliveries.own')) return <NoAccess />;
  const params = await searchParams;
  return (
    <div className="space-y-6">
      <PageHeader
        title="My deliveries"
        description={`Only your drops for ${formatKitchenDate(kitchenToday())} (IST), in delivery-time order. Open a drop for packing details and to mark it delivered.`}
      />
      <Suspense
        key={params.page}
        fallback={<div className="h-80 animate-pulse rounded-lg bg-muted" />}
      >
        <Content page={params.page} />
      </Suspense>
    </div>
  );
}
