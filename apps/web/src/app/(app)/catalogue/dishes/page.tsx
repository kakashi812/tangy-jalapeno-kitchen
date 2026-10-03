import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  DishListQuerySchema,
  type DishListQuery,
  type DishSummary,
  type Paginated,
  type ReferenceItem,
} from '@fernleaf/shared';
import { FilterBar, FilterSearch, FilterSelect } from '@/components/filter-bar';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { buttonVariants } from '@/components/ui/button';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { DishCard } from './dish-card';

export const metadata: Metadata = { title: 'Dishes' };

type SearchParams = Record<string, string | undefined>;

function toParams(query: DishListQuery): SearchParams {
  return {
    q: query.q || undefined,
    stationId: query.stationId,
    temperature: query.temperature,
    status: query.status === 'active' ? undefined : query.status,
    page: query.page > 1 ? String(query.page) : undefined,
  };
}

async function DishGrid({ query, showPrices }: { query: DishListQuery; showPrices: boolean }) {
  const params = new URLSearchParams(
    Object.entries({
      ...toParams(query),
      status: query.status,
      pageSize: String(query.pageSize),
    }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const result = await apiGet<Paginated<DishSummary>>(`/dishes?${params}`);

  return (
    <div className="space-y-3">
      {result.items.length === 0 ? (
        <p className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
          No dishes match these filters.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {result.items.map((dish) => (
            <li key={dish.id} className="flex">
              <DishCard dish={dish} showPrices={showPrices} />
            </li>
          ))}
        </ul>
      )}
      <Pagination
        pathname="/catalogue/dishes"
        params={toParams(query)}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </div>
  );
}

function DishGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4" aria-busy>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="h-80 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}

export default async function DishesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getSessionUser();
  if (!can(user, 'catalogue.read')) return <NoAccess />;

  const raw = await searchParams;
  // 24 per page fills rows of 2, 3 and 4 cards evenly.
  const parsed = DishListQuerySchema.safeParse({ pageSize: '24', ...raw });
  const query = parsed.success ? parsed.data : DishListQuerySchema.parse({ pageSize: '24' });
  const stations = await apiGet<ReferenceItem[]>('/reference/stations');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dishes"
        description="Everything the kitchen can cook. Dishes are deactivated, never deleted, because past orders refer to them."
        actions={
          can(user, 'catalogue.manage') ? (
            <Link href="/catalogue/dishes/new" className={buttonVariants()}>
              New dish
            </Link>
          ) : null
        }
      />

      <FilterBar
        action="/catalogue/dishes"
        active={Boolean(
          query.q || query.stationId || query.temperature || query.status !== 'active',
        )}
      >
        <FilterSearch name="q" defaultValue={query.q} placeholder="Search name or SKU" />
        <FilterSelect name="stationId" defaultValue={query.stationId ?? ''} aria-label="Station">
          <option value="">All stations</option>
          {stations.map((station) => (
            <option key={station.id} value={station.id}>
              {station.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          name="temperature"
          defaultValue={query.temperature ?? ''}
          aria-label="Hot or cold"
        >
          <option value="">Hot & cold</option>
          <option value="HOT">Hot</option>
          <option value="COLD">Cold</option>
        </FilterSelect>
        <FilterSelect name="status" defaultValue={query.status} aria-label="Status">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </FilterSelect>
      </FilterBar>

      <Suspense key={JSON.stringify(query)} fallback={<DishGridSkeleton />}>
        <DishGrid query={query} showPrices={can(user, 'pricing.read')} />
      </Suspense>
    </div>
  );
}
