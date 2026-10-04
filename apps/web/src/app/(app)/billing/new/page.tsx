import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  BillingQuerySchema,
  type BillingQuery,
  type BillingOrder,
  type Paginated,
} from '@fernleaf/shared';
import { FilterBar, FilterSelect } from '@/components/filter-bar';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Input } from '@/components/ui/input';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { InvoiceForm } from '../invoice-form';
export const metadata: Metadata = { title: 'Create invoice' };
type Params = Record<string, string | undefined>;
async function Uninvoiced({ query }: { query: BillingQuery }) {
  if (!query.companyId)
    return (
      <p className="rounded-lg border p-8 text-center text-muted-foreground">
        Choose a company to see its uninvoiced orders.
      </p>
    );
  const params = {
    companyId: query.companyId,
    through: query.through,
    page: String(query.page),
    pageSize: String(query.pageSize),
  };
  const search = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined),
  );
  const result = await apiGet<Paginated<BillingOrder>>(`/billing/uninvoiced?${search}`);
  return (
    <div className="space-y-4">
      {result.items.length ? (
        <InvoiceForm
          key={JSON.stringify(result.items.map((o) => [o.id, o.version]))}
          companyId={query.companyId}
          orders={result.items}
        />
      ) : (
        <p className="rounded-lg border p-8 text-center text-muted-foreground">
          No confirmed or delivered uninvoiced orders match.
        </p>
      )}
      <Pagination
        pathname="/billing/new"
        params={params}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </div>
  );
}
export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getSessionUser();
  if (!can(user, 'billing.manage')) return <NoAccess />;
  const parsed = BillingQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : BillingQuerySchema.parse({});
  const companies = await apiGet<{ id: string; name: string }[]>('/billing/companies');
  return (
    <div className="space-y-6">
      <Link className="text-sm text-primary hover:underline" href="/billing">
        ← Company billing
      </Link>
      <PageHeader
        title="Create internal invoice"
        description="Confirmed and delivered orders are owed in full. Cancelled/rejected orders are excluded. Issued amounts and membership stay fixed."
      />
      <FilterBar action="/billing/new" active={!!(query.companyId || query.through)}>
        <FilterSelect name="companyId" aria-label="Company" defaultValue={query.companyId ?? ''}>
          <option value="">Choose a company</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterSelect>
        <Input
          type="date"
          name="through"
          aria-label="Delivery up to"
          defaultValue={query.through}
          className="w-auto"
        />
      </FilterBar>
      <Suspense
        key={JSON.stringify(query)}
        fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" aria-busy />}
      >
        <Uninvoiced query={query} />
      </Suspense>
    </div>
  );
}
