import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  CompanyListQuerySchema,
  type CompanyListQuery,
  type CompanySummary,
  type Paginated,
  type TierSummary,
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

export const metadata: Metadata = { title: 'Companies' };

type SearchParams = Record<string, string | undefined>;

function toParams(query: CompanyListQuery): SearchParams {
  return {
    q: query.q || undefined,
    priceTierId: query.priceTierId,
    status: query.status === 'active' ? undefined : query.status,
    page: query.page > 1 ? String(query.page) : undefined,
  };
}

async function CompanyTable({ query }: { query: CompanyListQuery }) {
  const params = new URLSearchParams(
    Object.entries({
      ...toParams(query),
      status: query.status,
      pageSize: String(query.pageSize),
    }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const result = await apiGet<Paginated<CompanySummary>>(`/companies?${params}`);
  return (
    <div className="space-y-3">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Email domains</TableHead>
              <TableHead>Price tier</TableHead>
              <TableHead className="text-right">Employees</TableHead>
              <TableHead className="text-right">Addresses</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No companies match these filters.
                </TableCell>
              </TableRow>
            ) : (
              result.items.map((company) => (
                <TableRow key={company.id}>
                  <TableCell>
                    <Link href={`/companies/${company.id}`} className="font-medium hover:underline">
                      {company.name}
                    </Link>{' '}
                    {!company.isActive ? <Badge variant="outline">Inactive</Badge> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {company.domains.map((d) => `@${d}`).join(', ')}
                  </TableCell>
                  <TableCell>
                    {company.priceTier ? (
                      <>
                        {company.priceTier.name}
                        {company.priceTier.viaDefault ? (
                          <span className="text-muted-foreground"> (default)</span>
                        ) : null}
                      </>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{company.employeeCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{company.addressCount}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Pagination
        pathname="/companies"
        params={toParams(query)}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </div>
  );
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getSessionUser();
  if (!can(user, 'companies.read')) return <NoAccess />;
  const parsed = CompanyListQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : CompanyListQuerySchema.parse({});
  const tiers = can(user, 'pricing.read') ? await apiGet<TierSummary[]>('/price-tiers') : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies"
        description="Client companies. Their employees order meals, and every order is billed to the company."
        actions={
          can(user, 'companies.manage') ? (
            <Link href="/companies/new" className={buttonVariants()}>
              New company
            </Link>
          ) : null
        }
      />
      <FilterBar
        action="/companies"
        active={Boolean(query.q || query.priceTierId || query.status !== 'active')}
      >
        <FilterSearch name="q" defaultValue={query.q} placeholder="Search name or domain" />
        {tiers.length > 0 ? (
          <FilterSelect
            name="priceTierId"
            defaultValue={query.priceTierId ?? ''}
            aria-label="Price tier"
          >
            <option value="">All tiers</option>
            {tiers.map((tier) => (
              <option key={tier.id} value={tier.id}>
                {tier.name}
              </option>
            ))}
          </FilterSelect>
        ) : null}
        <FilterSelect name="status" defaultValue={query.status} aria-label="Status">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </FilterSelect>
      </FilterBar>
      <Suspense
        key={JSON.stringify(query)}
        fallback={<div className="h-80 animate-pulse rounded-lg bg-muted" aria-busy />}
      >
        <CompanyTable query={query} />
      </Suspense>
    </div>
  );
}
