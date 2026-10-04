import { Suspense } from 'react';
import {
  DROP_LABELS,
  DROP_STATES,
  DropQuerySchema,
  kitchenToday,
  type DropSummary,
  type Paginated,
} from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { FilterBar, FilterSelect } from '@/components/filter-bar';
import { Input } from '@/components/ui/input';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { DropActions, RefreshDrops, type DriverChoice } from './drop-actions';
import { DropCard } from './drop-card';
type Params = { deliveryDate?: string; state?: string; page?: string };
async function Content({
  params,
  assign,
  advance,
}: {
  params: Params;
  assign: boolean;
  advance: boolean;
}) {
  const parsed = DropQuerySchema.safeParse(params),
    query = parsed.success ? parsed.data : DropQuerySchema.parse({});
  const date = query.deliveryDate ?? kitchenToday();
  const qs = new URLSearchParams({ deliveryDate: date, page: String(query.page) });
  if (query.state) qs.set('state', query.state);
  const [data, drivers] = await Promise.all([
    apiGet<Paginated<DropSummary>>(`/drops?${qs}`),
    assign ? apiGet<DriverChoice[]>('/drops/drivers') : Promise.resolve([]),
  ]);
  return (
    <>
      <RefreshDrops />
      <FilterBar action="/dispatch" active={!!query.state}>
        <Input
          type="date"
          name="deliveryDate"
          defaultValue={date}
          aria-label="Delivery date"
          className="w-auto"
        />
        <FilterSelect name="state" defaultValue={query.state ?? ''} aria-label="Drop status">
          <option value="">All statuses</option>
          {DROP_STATES.map((state) => (
            <option key={state} value={state}>
              {DROP_LABELS[state]}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>
      <div className="grid gap-4 xl:grid-cols-2">
        {data.items.map((drop) => (
          <DropCard key={drop.id} drop={drop}>
            <DropActions drop={drop} drivers={drivers} assign={assign} advance={advance} />
          </DropCard>
        ))}
      </div>
      {!data.items.length && (
        <p className="rounded-lg border p-6 text-muted-foreground">
          No drops match this date and status.
        </p>
      )}
      <Pagination
        pathname="/dispatch"
        params={{ deliveryDate: date, state: query.state }}
        {...data}
      />
    </>
  );
}
export default async function DispatchPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getSessionUser();
  if (!can(user, 'dispatch.view')) return <NoAccess />;
  const params = await searchParams;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dispatch board"
        description="Drops grouped by company, address and exact delivery time · open a drop to view individual orders · IST"
      />
      <Suspense
        key={JSON.stringify(params)}
        fallback={<div className="h-80 animate-pulse rounded-lg bg-muted" />}
      >
        <Content
          params={params}
          assign={can(user, 'drops.assign')}
          advance={can(user, 'drops.advance')}
        />
      </Suspense>
    </div>
  );
}
