import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import {
  PriceGridQuerySchema,
  type Paginated,
  type PriceGridQuery,
  type PriceGridRow,
  type TierSummary,
} from '@fernleaf/shared';
import { FilterBar, FilterSearch, FilterSelect } from '@/components/filter-bar';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Badge } from '@/components/ui/badge';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { cn } from '@/lib/utils';
import { TierForm } from '../tier-form';
import { PriceGrid } from './price-grid';
import { TierActions } from './tier-actions';

export const metadata: Metadata = { title: 'Price tier' };

type SearchParams = Record<string, string | undefined>;

function toParams(query: PriceGridQuery): SearchParams {
  return {
    kind: query.kind === 'dishes' ? undefined : query.kind,
    q: query.q || undefined,
    missing: query.missing === 'true' ? 'true' : undefined,
    page: query.page > 1 ? String(query.page) : undefined,
  };
}

async function Grid({
  tier,
  query,
  canEdit,
}: {
  tier: TierSummary;
  query: PriceGridQuery;
  canEdit: boolean;
}) {
  const params = new URLSearchParams(
    Object.entries({
      ...toParams(query),
      kind: query.kind,
      pageSize: String(query.pageSize),
    }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const result = await apiGet<Paginated<PriceGridRow>>(`/price-tiers/${tier.id}/prices?${params}`);
  return (
    <div className="space-y-3">
      {result.items.length === 0 ? (
        <p className="rounded-lg border py-8 text-center text-sm text-muted-foreground">
          {query.missing === 'true'
            ? 'Nothing is missing a price on this tier.'
            : 'Nothing matches.'}
        </p>
      ) : (
        <PriceGrid tier={tier} kind={query.kind} rows={result.items} canEdit={canEdit} />
      )}
      <Pagination
        pathname={`/pricing/${tier.id}`}
        params={toParams(query)}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </div>
  );
}

async function loadTier(id: string) {
  try {
    return await apiGet<TierSummary>(`/price-tiers/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }
}

export default async function TierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await getSessionUser();
  if (!can(user, 'pricing.read')) return <NoAccess />;
  const canEdit = can(user, 'pricing.manage');
  const { id } = await params;
  const parsed = PriceGridQuerySchema.safeParse({ pageSize: '50', ...(await searchParams) });
  const query = parsed.success ? parsed.data : PriceGridQuerySchema.parse({ pageSize: '50' });
  const [tier, tiers] = await Promise.all([loadTier(id), apiGet<TierSummary[]>('/price-tiers')]);
  const tabHref = (kind: string) =>
    `/pricing/${tier.id}${kind === 'dishes' ? '' : `?kind=${kind}`}`;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href="/pricing" className="text-sm text-muted-foreground hover:underline">
          ← Price tiers
        </Link>
        <PageHeader
          title={tier.name}
          description={`${tier.ruleLabel} · ${tier.companyCount} compan${tier.companyCount === 1 ? 'y' : 'ies'}`}
          actions={tier.isDefault ? <Badge>Default tier</Badge> : null}
        />
      </div>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-bold">Prices</h2>
          <p className="text-sm text-muted-foreground">
            {tier.rule === 'MANUAL'
              ? 'Type a price for each item. Items without a price are not offered to companies on this tier.'
              : 'Prices follow the rule. Type a price to override it for one item; clear it to go back to the rule.'}{' '}
            Changes apply to new orders only.
          </p>
          {tier.missingDishes > 0 ? (
            <p className="text-sm font-medium text-destructive">
              {tier.missingDishes} active dish{tier.missingDishes === 1 ? '' : 'es'} have no price
              here.{' '}
              <Link href={`/pricing/${tier.id}?missing=true`} className="underline">
                Show them
              </Link>
            </p>
          ) : null}
        </div>
        <nav className="flex gap-1 border-b" aria-label="Item type">
          {(['dishes', 'options'] as const).map((kind) => (
            <Link
              key={kind}
              href={tabHref(kind)}
              aria-current={query.kind === kind ? 'page' : undefined}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm capitalize',
                query.kind === kind
                  ? 'border-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {kind}
            </Link>
          ))}
        </nav>
        <FilterBar
          action={`/pricing/${tier.id}`}
          active={Boolean(query.q || query.missing === 'true')}
        >
          {query.kind === 'options' ? <input type="hidden" name="kind" value="options" /> : null}
          <FilterSearch
            name="q"
            defaultValue={query.q}
            placeholder={query.kind === 'dishes' ? 'Search name or SKU' : 'Search options'}
          />
          <FilterSelect name="missing" defaultValue={query.missing} aria-label="Show">
            <option value="false">All items</option>
            <option value="true">Missing a price</option>
          </FilterSelect>
        </FilterBar>
        <Suspense
          key={JSON.stringify(query)}
          fallback={<div className="h-96 animate-pulse rounded-lg bg-muted" aria-busy />}
        >
          <Grid tier={tier} query={query} canEdit={canEdit} />
        </Suspense>
      </section>

      {canEdit ? (
        <section className="space-y-4 border-t pt-6">
          <h2 className="font-heading text-lg font-bold">Tier settings</h2>
          <TierForm tier={tier} tiers={tiers} />
          <TierActions tier={tier} />
        </section>
      ) : null}
    </div>
  );
}
