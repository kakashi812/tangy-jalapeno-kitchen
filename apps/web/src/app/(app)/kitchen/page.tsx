import type { Metadata } from 'next';
import { Suspense } from 'react';
import { KitchenQuerySchema, kitchenToday, type KitchenBoard } from '@fernleaf/shared';
import { FilterBar, FilterSelect } from '@/components/filter-bar';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Input } from '@/components/ui/input';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { Board } from './board';
export const metadata: Metadata = { title: 'Kitchen board' };
type Params = { deliveryDate?: string; stationId?: string; state?: string; page?: string };

async function Content({
  params,
  work,
  force,
  readOrders,
}: {
  params: Params;
  work: boolean;
  force: boolean;
  readOrders: boolean;
}) {
  const parsed = KitchenQuerySchema.safeParse(params);
  const query = parsed.success ? parsed.data : KitchenQuerySchema.parse({});
  const date = query.deliveryDate ?? kitchenToday();
  const qs = new URLSearchParams({
    deliveryDate: date,
    state: query.state,
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.stationId) qs.set('stationId', query.stationId);
  const data = await apiGet<KitchenBoard>(`/kitchen?${qs}`);
  return (
    <>
      <FilterBar action="/kitchen" active={!!query.stationId || query.state !== 'open'}>
        <Input
          name="deliveryDate"
          type="date"
          defaultValue={date}
          aria-label="Delivery date"
          className="w-auto"
        />
        <FilterSelect
          name="stationId"
          defaultValue={query.stationId ?? ''}
          aria-label="Kitchen station"
        >
          <option value="">All stations</option>
          {data.stations.map((s) => (
            <option key={s.id ?? 'unassigned'} value={s.id ?? 'unassigned'}>
              {s.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect name="state" defaultValue={query.state} aria-label="Work status">
          <option value="open">Remaining work</option>
          <option value="done">Completed</option>
          <option value="all">All units</option>
        </FilterSelect>
      </FilterBar>
      <Board
        data={data}
        stationId={query.stationId}
        work={work}
        force={force}
        readOrders={readOrders}
      />
      <Pagination
        pathname="/kitchen"
        params={{ deliveryDate: date, state: query.state, stationId: query.stationId }}
        {...data.units}
      />
    </>
  );
}

export default async function KitchenPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getSessionUser();
  if (!can(user, 'kitchen.view')) return <NoAccess />;
  const params = await searchParams;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Kitchen board"
        description="One unit per meal combination · confirmed orders only · all times IST"
      />
      <Suspense
        key={JSON.stringify(params)}
        fallback={<div className="h-80 animate-pulse rounded-lg bg-muted" aria-busy />}
      >
        <Content
          params={params}
          work={can(user, 'kitchen.work')}
          force={can(user, 'kitchen.forceComplete')}
          readOrders={can(user, 'orders.read')}
        />
      </Suspense>
    </div>
  );
}
