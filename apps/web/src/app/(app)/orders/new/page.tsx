import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  IsoDateSchema,
  OrderEmployeeQuerySchema,
  formatKitchenDate,
  kitchenToday,
  type OrderContext,
  type OrderEmployeeChoice,
  type Paginated,
} from '@fernleaf/shared';
import { FilterBar, FilterSearch } from '@/components/filter-bar';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Input } from '@/components/ui/input';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { OrderForm } from '../order-form';
export const metadata: Metadata = { title: 'Create order' };
type Params = { employeeId?: string; deliveryDate?: string; q?: string; page?: string };
async function Editor({
  employeeId,
  date,
  admin,
}: {
  employeeId: string;
  date: string;
  admin: boolean;
}) {
  const context = await apiGet<OrderContext>(
    `/orders/context?${new URLSearchParams({ employeeId, deliveryDate: date })}`,
  );
  return <OrderForm context={context} admin={admin} />;
}
export default async function NewOrderPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getSessionUser();
  if (!can(user, 'orders.write')) return <NoAccess />;
  const params = await searchParams;
  const parsedDate = IsoDateSchema.safeParse(params.deliveryDate);
  const date = parsedDate.success ? parsedDate.data : kitchenToday();
  if (params.employeeId)
    return (
      <div className="space-y-6">
        <Link href="/orders/new" className="text-sm text-muted-foreground hover:underline">
          ← Change employee / date
        </Link>
        <PageHeader
          title="Create order"
          description={`Delivery ${formatKitchenDate(date)} · prices validated by the API`}
        />
        <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-muted" aria-busy />}>
          <Editor employeeId={params.employeeId} date={date} admin={can(user, 'orders.override')} />
        </Suspense>
      </div>
    );
  const parsed = OrderEmployeeQuerySchema.safeParse({ q: params.q, page: params.page });
  const query = parsed.success ? parsed.data : OrderEmployeeQuerySchema.parse({});
  const employees = await apiGet<Paginated<OrderEmployeeChoice>>(
    `/orders/employees?${new URLSearchParams({ q: query.q, page: String(query.page), pageSize: String(query.pageSize) })}`,
  );
  return (
    <div className="space-y-6">
      <Link href="/orders" className="text-sm text-muted-foreground hover:underline">
        ← Orders
      </Link>
      <PageHeader
        title="Create order"
        description="Choose the delivery date and employee, then build their meal from the company’s menu."
      />
      <FilterBar action="/orders/new" active={!!query.q}>
        <FilterSearch
          name="q"
          defaultValue={query.q}
          placeholder="Search employee, email or company"
        />
        <Input
          type="date"
          name="deliveryDate"
          defaultValue={date}
          aria-label="Delivery date"
          className="w-auto"
        />
      </FilterBar>
      <ul className="divide-y rounded-lg border">
        {employees.items.map((e) => (
          <li key={e.id}>
            <Link
              className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-muted/40"
              href={`/orders/new?${new URLSearchParams({ employeeId: e.id, deliveryDate: date })}`}
            >
              <div>
                <p className="font-medium">{e.name}</p>
                <p className="text-sm text-muted-foreground">
                  {e.company.name} · {e.email}
                </p>
              </div>
              <span className="text-sm text-primary">Build order →</span>
            </Link>
          </li>
        ))}
        {!employees.items.length && (
          <li className="p-6 text-muted-foreground">No matching employees at active companies.</li>
        )}
      </ul>
      <Pagination
        pathname="/orders/new"
        params={{ q: query.q || undefined, deliveryDate: date }}
        page={employees.page}
        pageSize={employees.pageSize}
        total={employees.total}
      />
    </div>
  );
}
