import { z } from 'zod';
import { IsoDateSchema } from './calendar.js';
import { PageQuerySchema, type Paginated } from './pagination.js';

export const DROP_STATES = [
  'WAITING',
  'KITCHEN_READY',
  'DISPATCH_READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;
export type DropState = (typeof DROP_STATES)[number];
export const DROP_LABELS: Record<DropState, string> = {
  WAITING: 'Waiting for kitchen',
  KITCHEN_READY: 'Kitchen ready',
  DISPATCH_READY: 'Dispatch ready',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
};
const optionalId = z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional());
export const DropQuerySchema = PageQuerySchema.extend({
  deliveryDate: IsoDateSchema.optional(),
  companyId: optionalId,
  driverId: optionalId,
  state: z.preprocess((v) => (v === '' ? undefined : v), z.enum(DROP_STATES).optional()),
});
export type DropQuery = z.infer<typeof DropQuerySchema>;
export const DropActionSchema = z.object({ version: z.coerce.number().int().nonnegative() });
export const DropAssignmentSchema = DropActionSchema.extend({ driverId: z.uuid().nullable() });
export const DeliveryInputSchema = DropActionSchema.extend({
  note: z.string().trim().max(2000).default(''),
});
export type DeliveryInput = z.infer<typeof DeliveryInputSchema>;
export const DELIVERY_PHOTO_MAX_BYTES = 2 * 1024 * 1024;

export function dropState(
  status: Exclude<DropState, 'KITCHEN_READY'>,
  orders: number,
  readyOrders: number,
): DropState {
  return status === 'WAITING' && orders > 0 && orders === readyOrders ? 'KITCHEN_READY' : status;
}
export function deliveryOnTime(deliveredAt: Date, plannedAt: Date): boolean {
  return deliveredAt.getTime() <= plannedAt.getTime();
}
export type DropSummary = {
  id: string;
  version: number;
  company: { id: string; name: string };
  addressText: string;
  deliveryDate: string;
  deliveryTimeMinutes: number;
  state: DropState;
  driver: { id: string; name: string; isActive: boolean } | null;
  orderCount: number;
  readyOrderCount: number;
  dispatchReadyAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  deliveryNote: string;
  photoUrl: string | null;
  onTime: boolean | null;
};
export type DropOrder = {
  id: string;
  number: string;
  employeeName: string;
  companyName: string;
  addressText: string;
  packagingName: string;
  notes: string;
  driverInstructions: string;
  kitchenReadyAt: string | null;
  quantity: number;
};
export type DropDetail = DropSummary & { orders: Paginated<DropOrder>; canDeliver: boolean };
