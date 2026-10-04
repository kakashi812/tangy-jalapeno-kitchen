import { z } from 'zod';
import { IsoDateSchema } from './calendar.js';
import { PageQuerySchema, type Paginated } from './pagination.js';
import { addDays, type IsoDate } from './kitchen-time.js';

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

/** Tabs on a driver's own deliveries page. Today stays the default landing view (brief 4.8). */
export const DELIVERY_WINDOWS = ['today', 'upcoming', 'past'] as const;
export type DeliveryWindow = (typeof DELIVERY_WINDOWS)[number];
/** How far a driver can look back and ahead, in calendar days from the kitchen's today. */
export const DRIVER_PAST_DAYS = 30;
export const DRIVER_UPCOMING_DAYS = 14;
export const DeliveryQuerySchema = PageQuerySchema.extend({
  window: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(DELIVERY_WINDOWS).default('today'),
  ),
});
export type DeliveryQuery = z.infer<typeof DeliveryQuerySchema>;

/** Inclusive kitchen-date range of one tab. Past excludes today; upcoming starts tomorrow. */
export function deliveryWindowRange(window: DeliveryWindow, today: IsoDate) {
  if (window === 'past') return { from: addDays(today, -DRIVER_PAST_DAYS), to: addDays(today, -1) };
  if (window === 'upcoming')
    return { from: addDays(today, 1), to: addDays(today, DRIVER_UPCOMING_DAYS) };
  return { from: today, to: today };
}

/** Every date a driver may open one of their own drops for: all three tabs together. */
export function driverVisibleRange(today: IsoDate) {
  return { from: addDays(today, -DRIVER_PAST_DAYS), to: addDays(today, DRIVER_UPCOMING_DAYS) };
}
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
