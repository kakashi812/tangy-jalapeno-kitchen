import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import {
  DROP_LABELS,
  PageQuerySchema,
  formatKitchenDate,
  formatKitchenDateTime,
  formatTimeOfDay,
  type DropDetail,
} from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { apiGet } from '@/lib/api/server';
import { ApiRequestError } from '@/lib/api/api-error';
import { can, getSessionUser } from '@/lib/session';
import { DropActions, RefreshDrops, type DriverChoice } from '../../dispatch/drop-actions';
import { DeliveryForm } from '../../deliveries/delivery-form';
export default async function DropPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await getSessionUser();
  if (!can(user, 'dispatch.view') && !can(user, 'deliveries.own')) return <NoAccess />;
  const { id } = await params,
    raw = await searchParams,
    parsed = PageQuerySchema.safeParse(raw),
    query = parsed.success ? parsed.data : PageQuerySchema.parse({});
  let drop: DropDetail;
  try {
    drop = await apiGet<DropDetail>(`/drops/${id}?page=${query.page}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }
  const drivers = can(user, 'drops.assign') ? await apiGet<DriverChoice[]>('/drops/drivers') : [];
  return (
    <div className="space-y-6">
      <RefreshDrops />
      <PageHeader
        title={`${drop.company.name} · ${formatTimeOfDay(drop.deliveryTimeMinutes)}`}
        description={`${formatKitchenDate(drop.deliveryDate)} (IST) · ${DROP_LABELS[drop.state]}`}
      />
      <div className="space-y-2 rounded-lg border p-4">
        <p className="break-words">{drop.addressText}</p>
        <p>
          {drop.orderCount} orders · {drop.readyOrderCount} kitchen-ready
        </p>
        <p>Driver: {drop.driver?.name ?? 'Unassigned'}</p>
        {drop.dispatchReadyAt && (
          <p className="text-sm">
            Dispatch ready: {formatKitchenDateTime(new Date(drop.dispatchReadyAt))}
          </p>
        )}
        {drop.outForDeliveryAt && (
          <p className="text-sm">
            Departed: {formatKitchenDateTime(new Date(drop.outForDeliveryAt))}
          </p>
        )}
        {drop.deliveredAt && (
          <p className="text-sm">
            Delivered: {formatKitchenDateTime(new Date(drop.deliveredAt))} ·{' '}
            {drop.onTime ? 'On time' : 'Late'}
          </p>
        )}
        {drop.deliveryNote && (
          <p className="break-words text-sm">Delivery note: {drop.deliveryNote}</p>
        )}
        {drop.photoUrl && (
          <Image
            src={drop.photoUrl}
            alt="Delivery confirmation photo"
            width={640}
            height={480}
            className="h-auto max-w-full rounded-lg object-contain"
          />
        )}
      </div>
      <DropActions
        drop={drop}
        drivers={drivers}
        assign={can(user, 'drops.assign')}
        advance={can(user, 'drops.advance')}
      />
      {drop.canDeliver && <DeliveryForm id={id} version={drop.version} />}
      <h2 className="font-heading text-2xl font-bold">Individual orders</h2>
      <div className="space-y-3">
        {drop.orders.items.map((order) => (
          <article key={order.id} className="space-y-2 rounded-lg border p-4">
            <p className="font-semibold">
              {can(user, 'orders.read') ? (
                <Link href={`/orders/${order.id}`} className="underline">
                  {order.number}
                </Link>
              ) : (
                order.number
              )}{' '}
              · {order.employeeName}
            </p>
            <p className="text-sm">
              {order.quantity} items · {order.packagingName} ·{' '}
              {order.kitchenReadyAt ? 'Kitchen ready' : 'Waiting for kitchen'}
            </p>
            <p className="break-words text-sm">{order.addressText}</p>
            {order.driverInstructions && (
              <p className="break-words text-sm">Driver instructions: {order.driverInstructions}</p>
            )}
            {order.notes && <p className="break-words text-sm">Order note: {order.notes}</p>}
          </article>
        ))}
      </div>
      <Pagination pathname={`/drops/${id}`} params={{}} {...drop.orders} />
    </div>
  );
}
