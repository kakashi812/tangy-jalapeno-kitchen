import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  BillingQuerySchema,
  formatCents,
  formatKitchenDateTime,
  type BillingQuery,
  type InvoiceSummary,
  type Paginated,
} from '@fernleaf/shared';
import { FilterBar, FilterSelect } from '@/components/filter-bar';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
export const metadata: Metadata = { title: 'Company billing' };
type Params = Record<string, string | undefined>;
function params(q: BillingQuery): Params {
  return {
    companyId: q.companyId,
    status: q.status,
    review: q.review,
    page: q.page > 1 ? String(q.page) : undefined,
  };
}
async function Invoices({ query }: { query: BillingQuery }) {
  const search = new URLSearchParams(
    Object.entries({ ...params(query), pageSize: String(query.pageSize) }).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );
  const result = await apiGet<Paginated<InvoiceSummary>>(`/billing/invoices?${search}`);
  return (
    <div className="space-y-4">
      <div className="divide-y rounded-lg border">
        {result.items.map((i) => (
          <Link
            key={i.id}
            href={`/billing/${i.id}`}
            className="flex flex-wrap items-center justify-between gap-4 p-4 hover:bg-muted/30"
          >
            <div>
              <p className="font-medium">
                {i.number} · {i.company.name}
              </p>
              <p className="text-sm text-muted-foreground">
                Issued {formatKitchenDateTime(new Date(i.issuedAt))} · {i.orderCount} orders
              </p>
              {i.needsReview && (
                <p className="text-sm text-amber-700">
                  Changed after invoicing — staff review required
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="font-medium tabular-nums">{formatCents(i.totalCents)}</p>
              <Badge variant="outline">{i.paidAt ? 'Paid' : 'Unpaid'}</Badge>
            </div>
          </Link>
        ))}
        {!result.items.length && (
          <p className="p-8 text-center text-muted-foreground">No invoices match these filters.</p>
        )}
      </div>
      <Pagination
        pathname="/billing"
        params={params(query)}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </div>
  );
}
export default async function BillingPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getSessionUser();
  if (!can(user, 'billing.read')) return <NoAccess />;
  const parsed = BillingQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : BillingQuerySchema.parse({});
  const companies = await apiGet<{ id: string; name: string }[]>('/billing/companies');
  return (
    <div className="space-y-6">
      <PageHeader
        title="Company billing"
        description="Internal invoices only. No payment processing, tax, fees or automatic adjustments."
        actions={
          can(user, 'billing.manage') ? (
            <Link href="/billing/new" className={buttonVariants()}>
              Create invoice
            </Link>
          ) : null
        }
      />
      <FilterBar action="/billing" active={!!(query.companyId || query.status || query.review)}>
        <FilterSelect name="companyId" aria-label="Company" defaultValue={query.companyId ?? ''}>
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect name="status" aria-label="Payment status" defaultValue={query.status ?? ''}>
          <option value="">Any payment status</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PAID">Paid</option>
        </FilterSelect>
        <FilterSelect name="review" aria-label="Staff review" defaultValue={query.review ?? ''}>
          <option value="">Any review status</option>
          <option value="true">Needs review</option>
          <option value="false">No changes flagged</option>
        </FilterSelect>
      </FilterBar>
      <Suspense
        key={JSON.stringify(query)}
        fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" aria-busy />}
      >
        <Invoices query={query} />
      </Suspense>
    </div>
  );
}
