import { HttpStatus } from '@nestjs/common';
import type { OrderStatus, Permission, SessionUser } from '@fernleaf/shared';
import { ApiException } from '../common/api-exception.js';

export const has = (user: SessionUser, permission: Permission) =>
  user.permissions.includes(permission);
type OrderState = {
  status: OrderStatus;
  cutoffAt: Date;
  kitchenStartedAt: Date | null;
  outForDeliveryAt: Date | null;
};

export function orderPermissions(order: OrderState, user: SessionUser, closed: boolean, now: Date) {
  const locked = closed || order.cutoffAt <= now;
  const admin = has(user, 'orders.override');
  const writable = has(user, 'orders.write');
  const pending = order.status === 'DRAFT' || order.status === 'PLACED';
  return {
    edit:
      (pending && writable && (!locked || admin)) ||
      (order.status === 'CONFIRMED' && writable && admin && !order.kitchenStartedAt),
    place: order.status === 'DRAFT' && writable && (!locked || admin),
    cancel:
      (pending && writable && (!locked || admin)) ||
      (order.status === 'CONFIRMED' && writable && admin && !order.outForDeliveryAt),
    reject: admin && ['PLACED', 'CONFIRMED'].includes(order.status) && !order.outForDeliveryAt,
    override: admin && order.status === 'CONFIRMED' && !order.outForDeliveryAt,
  };
}

export function requireAction(allowed: boolean): void {
  if (!allowed)
    throw new ApiException(
      HttpStatus.CONFLICT,
      'ORDER_LOCKED',
      'This action is not allowed in the order’s current state. Refresh the order.',
    );
}
export function requireVersion(actual: number, supplied: number | undefined): void {
  if (actual !== supplied)
    throw new ApiException(
      HttpStatus.CONFLICT,
      'CONCURRENT_UPDATE',
      'This order changed since you opened it. Refresh before trying again.',
    );
}

/** Cutoff only advances pending orders; repeating it cannot repeat a lifecycle event. */
export function cutoffStatus(status: OrderStatus): OrderStatus {
  return status === 'DRAFT' ? 'CANCELLED' : status === 'PLACED' ? 'CONFIRMED' : status;
}
