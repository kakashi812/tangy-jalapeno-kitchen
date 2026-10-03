import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  EmployeeListQuerySchema,
  type CompanySummary,
  type EmployeeListQuery,
  type EmployeeSummary,
  type Paginated,
} from '@fernleaf/shared';
import { FilterBar, FilterSearch, FilterSelect } from '@/components/filter-bar';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { buttonVariants } from '@/components/ui/button';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { EmployeeTable } from './employee-table';

export const metadata: Metadata = { title: 'Employees' };

type SearchParams = Record<string, string | undefined>;

function toParams(query: EmployeeListQuery): SearchParams {
  return {
    q: query.q || undefined,
    companyId: query.companyId,
    page: query.page > 1 ? String(query.page) : undefined,
  };
}

async function Employees({ query }: { query: EmployeeListQuery }) {
  const params = new URLSearchParams(
    Object.entries({ ...toParams(query), pageSize: String(query.pageSize) }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  const result = await apiGet<Paginated<EmployeeSummary>>(`/employees?${params}`);
  return (
    <div className="space-y-3">
      <EmployeeTable employees={result.items} showCompany={!query.companyId} />
      <Pagination
        pathname="/employees"
        params={toParams(query)}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </div>
  );
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getSessionUser();
  if (!can(user, 'employees.read')) return <NoAccess />;
  const parsed = EmployeeListQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : EmployeeListQuerySchema.parse({});
  const companies = await apiGet<Paginated<CompanySummary>>('/companies?status=all&pageSize=100');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="The people meals are ordered for. They never sign in; staff order on their behalf."
        actions={
          can(user, 'employees.manage') ? (
            <Link href="/employees/new" className={buttonVariants()}>
              Add employee
            </Link>
          ) : null
        }
      />
      <FilterBar action="/employees" active={Boolean(query.q || query.companyId)}>
        <FilterSearch name="q" defaultValue={query.q} placeholder="Search name or email" />
        <FilterSelect name="companyId" defaultValue={query.companyId ?? ''} aria-label="Company">
          <option value="">All companies</option>
          {companies.items.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>
      <Suspense
        key={JSON.stringify(query)}
        fallback={<div className="h-96 animate-pulse rounded-lg bg-muted" aria-busy />}
      >
        <Employees query={query} />
      </Suspense>
    </div>
  );
}
