import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  ORDER_STATUSES,
  OrderListQuerySchema,
  formatCents,
  formatKitchenDate,
  formatTimeOfDay,
  kitchenToday,
  type OrderListQuery,
  type OrderSummary,
  type Paginated,
} from '@fernleaf/shared';
import { FilterBar, FilterSearch, FilterSelect } from '@/components/filter-bar';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { CloseOrders } from './close-orders';

export const metadata: Metadata = { title: 'Orders' };
type Params = Record<string, string | undefined>;
function toParams(q: OrderListQuery): Params {
  return {
    q: q.q || undefined,
    from: q.from,
    to: q.to,
    status: q.status,
    companyId: q.companyId,
    invoiced: q.invoiced,
    page: q.page > 1 ? String(q.page) : undefined,
  };
}
async function Orders({ query, money }: { query: OrderListQuery; money: boolean }) {
  const params = new URLSearchParams(
    Object.entries({ ...toParams(query), pageSize: String(query.pageSize) }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  const result = await apiGet<Paginated<OrderSummary>>(`/orders?${params}`);
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40">
            <tr>
              {[
                'Order / employee',
                'Company',
                'Delivery (IST)',
                'Status',
                ...(money ? ['Total'] : []),
              ].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.items.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="px-4 py-3">
                  <Link
                    href={`/orders/${o.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {o.number}
                  </Link>
                  <p className="text-muted-foreground">{o.employee.name}</p>
                </td>
                <td className="px-4 py-3">{o.company.name}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatKitchenDate(o.deliveryDate)}
                  <p className="text-muted-foreground">{formatTimeOfDay(o.deliveryTimeMinutes)}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{o.status}</Badge>
                  {o.invoiced && <p className="mt-1 text-xs text-muted-foreground">Invoiced</p>}
                </td>
                {money && (
                  <td className="px-4 py-3 tabular-nums">
                    {o.totalCents === undefined ? '—' : formatCents(o.totalCents)}
                  </td>
                )}
              </tr>
            ))}
            {!result.items.length && (
              <tr>
                <td colSpan={money ? 5 : 4} className="p-8 text-center text-muted-foreground">
                  No orders match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        pathname="/orders"
        params={toParams(query)}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </div>
  );
}
export default async function OrdersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getSessionUser();
  if (!can(user, 'orders.read')) return <NoAccess />;
  const raw = Object.fromEntries(Object.entries(await searchParams).filter(([, v]) => v !== ''));
  const parsed = OrderListQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : OrderListQuerySchema.parse({});
  const companies = await apiGet<{ id: string; name: string }[]>('/orders/companies');
  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Meals ordered on behalf of employees. All dates and times are kitchen time (IST)."
        actions={
          can(user, 'orders.write') ? (
            <Link href="/orders/new" className={buttonVariants()}>
              Create order
            </Link>
          ) : null
        }
      />
      <FilterBar
        action="/orders"
        active={Object.entries(toParams(query)).some(([k, v]) => k !== 'page' && !!v)}
      >
        <FilterSearch
          name="q"
          defaultValue={query.q}
          placeholder="Order number, employee or company"
        />
        <Input
          type="date"
          name="from"
          defaultValue={query.from}
          aria-label="Delivery from"
          className="w-auto"
        />
        <Input
          type="date"
          name="to"
          defaultValue={query.to}
          aria-label="Delivery to"
          className="w-auto"
        />
        <FilterSelect name="status" defaultValue={query.status ?? ''} aria-label="Status">
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </FilterSelect>
        <FilterSelect name="companyId" defaultValue={query.companyId ?? ''} aria-label="Company">
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect name="invoiced" defaultValue={query.invoiced ?? ''} aria-label="Invoiced">
          <option value="">Any invoice status</option>
          <option value="true">Invoiced</option>
          <option value="false">Not invoiced</option>
        </FilterSelect>
      </FilterBar>
      <Suspense
        key={JSON.stringify(query)}
        fallback={<div className="h-72 animate-pulse rounded-lg bg-muted" aria-busy />}
      >
        <Orders query={query} money={can(user, 'orders.readMoney')} />
      </Suspense>
      {can(user, 'cutoff.run') && <CloseOrders today={kitchenToday()} />}
    </div>
  );
}
