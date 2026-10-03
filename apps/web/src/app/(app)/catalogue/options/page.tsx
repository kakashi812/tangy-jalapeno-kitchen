import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  OptionListQuerySchema,
  formatCents,
  type OptionListQuery,
  type OptionSummary,
  type Paginated,
} from '@fernleaf/shared';
import { FilterBar, FilterSearch, FilterSelect } from '@/components/filter-bar';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Options' };

type SearchParams = Record<string, string | undefined>;

function toParams(query: OptionListQuery): SearchParams {
  return {
    q: query.q || undefined,
    status: query.status === 'active' ? undefined : query.status,
    page: query.page > 1 ? String(query.page) : undefined,
  };
}

async function OptionTable({ query }: { query: OptionListQuery }) {
  const params = new URLSearchParams(
    Object.entries({
      ...toParams(query),
      status: query.status,
      pageSize: String(query.pageSize),
    }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const result = await apiGet<Paginated<OptionSummary>>(`/options?${params}`);
  const showCost = result.items.some((o) => o.costCents !== undefined);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Option</TableHead>
              <TableHead>Allergens</TableHead>
              <TableHead>Dietary tags</TableHead>
              {showCost ? <TableHead className="text-right">Cost</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No options match these filters.
                </TableCell>
              </TableRow>
            ) : (
              result.items.map((option) => (
                <TableRow key={option.id}>
                  <TableCell>
                    <Link
                      href={`/catalogue/options/${option.id}`}
                      className="font-medium hover:underline"
                    >
                      {option.name}
                    </Link>{' '}
                    {!option.isActive ? <Badge variant="outline">Inactive</Badge> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {option.allergens.map((a) => a.name).join(', ') || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {option.dietaryTags.map((t) => t.name).join(', ') || '—'}
                  </TableCell>
                  {showCost ? (
                    <TableCell className="text-right">
                      {option.costCents !== undefined ? formatCents(option.costCents) : ''}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Pagination
        pathname="/catalogue/options"
        params={toParams(query)}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </div>
  );
}

export default async function OptionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getSessionUser();
  if (!can(user, 'catalogue.read')) return <NoAccess />;
  const parsed = OptionListQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : OptionListQuerySchema.parse({});

  return (
    <div className="space-y-6">
      <PageHeader
        title="Options"
        description="Reusable choices (proteins, rice, sides…) that dishes offer in their option groups."
        actions={
          can(user, 'catalogue.manage') ? (
            <Link href="/catalogue/options/new" className={buttonVariants()}>
              New option
            </Link>
          ) : null
        }
      />
      <FilterBar action="/catalogue/options" active={Boolean(query.q || query.status !== 'active')}>
        <FilterSearch name="q" defaultValue={query.q} placeholder="Search options" />
        <FilterSelect name="status" defaultValue={query.status} aria-label="Status">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </FilterSelect>
      </FilterBar>
      <Suspense
        key={JSON.stringify(query)}
        fallback={<div className="h-96 animate-pulse rounded-lg bg-muted" aria-busy />}
      >
        <OptionTable query={query} />
      </Suspense>
    </div>
  );
}
