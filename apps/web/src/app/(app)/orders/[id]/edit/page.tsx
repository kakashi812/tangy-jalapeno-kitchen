import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { OrderContext, OrderDetail } from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { OrderForm, type EditableOrder } from '../../order-form';

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!can(user, 'orders.write') || !can(user, 'orders.read') || !can(user, 'orders.readMoney'))
    return <NoAccess />;
  const { id } = await params;
  let order: OrderDetail;
  try {
    order = await apiGet<OrderDetail>(`/orders/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }
  if (!order.permissions.edit)
    return (
      <div className="space-y-3">
        <PageHeader
          title={order.number}
          description="This order can no longer be edited in its current state."
        />
        <Link href={`/orders/${id}`} className="text-sm underline">
          Return to order
        </Link>
      </div>
    );
  const context = await apiGet<OrderContext>(`/orders/${id}/edit-context`);
  // orders.readMoney was checked both here and by the API's response projection.
  return (
    <div className="space-y-6">
      <Link href={`/orders/${id}`} className="text-sm text-muted-foreground hover:underline">
        ← {order.number}
      </Link>
      <PageHeader
        title={`Edit ${order.number}`}
        description="Untouched lines keep their original prices; changed lines use the current menu."
      />
      <OrderForm
        key={order.version}
        context={context}
        order={order as EditableOrder}
        admin={can(user, 'orders.override')}
      />
    </div>
  );
}
