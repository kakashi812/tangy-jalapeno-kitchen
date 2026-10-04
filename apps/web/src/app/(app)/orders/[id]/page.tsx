import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  formatCents,
  formatKitchenDate,
  formatKitchenDateTime,
  formatTimeOfDay,
  type OrderDetail,
  type OverrideChoices,
} from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { OrderActions, OverrideForm } from './order-actions';
export const metadata: Metadata = { title: 'Order' };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!can(user, 'orders.read')) return <NoAccess />;
  const { id } = await params;
  let order: OrderDetail;
  try {
    order = await apiGet<OrderDetail>(`/orders/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }
  const choices = order.permissions.override
    ? await apiGet<OverrideChoices>(`/orders/${id}/override-choices`)
    : null;
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href="/orders" className="text-sm text-muted-foreground hover:underline">
          ← Orders
        </Link>
        <PageHeader
          title={order.number}
          description={`${order.employee.name} · ${order.company.name}`}
          actions={
            order.permissions.edit && can(user, 'orders.readMoney') ? (
              <Link href={`/orders/${id}/edit`} className={buttonVariants({ variant: 'outline' })}>
                Edit order
              </Link>
            ) : null
          }
        />
      </div>
      <section className="space-y-3 rounded-lg border bg-muted/30 p-4">
        <div className="flex flex-wrap gap-2">
          <Badge>{order.status}</Badge>
          <Badge variant="outline">{order.locked ? 'Closed' : 'Before cutoff'}</Badge>
          {order.invoiced && <Badge variant="outline">Invoiced</Badge>}
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Delivery (IST)</dt>
            <dd>
              {formatKitchenDate(order.deliveryDate)} · {formatTimeOfDay(order.deliveryTimeMinutes)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Saved cutoff (IST)</dt>
            <dd>{formatKitchenDateTime(new Date(order.cutoffAt))}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Address</dt>
            <dd>{order.addressText}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Packaging</dt>
            <dd>{order.packagingName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Kitchen-ready plan (IST)</dt>
            <dd>{formatKitchenDateTime(new Date(order.plannedKitchenReadyAt))}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Dispatch-ready plan (IST)</dt>
            <dd>{formatKitchenDateTime(new Date(order.plannedDispatchReadyAt))}</dd>
          </div>
          {order.notes && (
            <div>
              <dt className="text-muted-foreground">Order notes</dt>
              <dd>{order.notes}</dd>
            </div>
          )}
          {order.driverInstructions && (
            <div>
              <dt className="text-muted-foreground">Driver instructions</dt>
              <dd>{order.driverInstructions}</dd>
            </div>
          )}
        </dl>
      </section>
      <OrderActions key={order.version} order={order} />
      <section className="space-y-4">
        <h2 className="font-heading text-xl font-bold">Saved order lines</h2>
        {order.lines.map((line) => (
          <article key={line.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex justify-between gap-3">
              <div>
                <h3 className="font-medium">
                  {line.quantity} × {line.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {line.sku} · {line.temperature === 'HOT' ? 'Hot' : 'Cold'} ·{' '}
                  {line.stationName ?? 'Unassigned'}
                </p>
              </div>
              {line.totalCents !== undefined && (
                <p className="font-medium tabular-nums">{formatCents(line.totalCents)}</p>
              )}
            </div>
            {line.dishPriceCents !== undefined && (
              <p className="text-sm text-muted-foreground">
                Dish base: {formatCents(line.dishPriceCents)} per meal
              </p>
            )}
            <ul className="divide-y text-sm">
              {line.combinations.map((c, index) => (
                <li key={line.combinationIds[index]} className="space-y-1 py-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <p>
                      {c.quantity} × {c.options.map((o) => o.name).join(' + ') || 'No options'}
                    </p>
                    {c.unitPriceCents !== undefined && c.totalCents !== undefined && (
                      <p className="tabular-nums">
                        {formatCents(c.unitPriceCents)} each · {formatCents(c.totalCents)}
                      </p>
                    )}
                  </div>
                  {c.options.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {c.options
                        .map(
                          (o) =>
                            `${o.groupName}: ${o.name}${o.priceCents !== undefined ? ` (+${formatCents(o.priceCents)})` : ''}`,
                        )
                        .join(' · ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </article>
        ))}
        {!order.lines.length && (
          <p className="text-sm text-muted-foreground">This draft has no lines yet.</p>
        )}
        {order.totalCents !== undefined && (
          <p className="text-right text-lg font-semibold">
            Total: {formatCents(order.totalCents)}{' '}
            <span className="text-xs font-normal text-muted-foreground">pre-tax</span>
          </p>
        )}
      </section>
      {choices && (
        <OverrideForm key={`override-${order.version}`} order={order} choices={choices} />
      )}
      <section className="space-y-4">
        <h2 className="font-heading text-xl font-bold">Timeline</h2>
        <ol className="space-y-4 border-l pl-4">
          {order.events.map((event) => (
            <li key={event.id}>
              <p className="text-xs text-muted-foreground">
                {formatKitchenDateTime(new Date(event.at))} IST ·{' '}
                {event.actor ?? 'Automatic processing'}
              </p>
              <p className="text-sm font-medium">{event.type.replaceAll('_', ' ')}</p>
              <p className="text-sm text-muted-foreground">{event.description}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
