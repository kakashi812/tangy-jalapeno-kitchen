import { z } from 'zod';
import { IsoDateSchema } from './calendar.js';
import { PageQuerySchema, type Paginated } from './pagination.js';

export const KitchenQuerySchema = PageQuerySchema.extend({
  deliveryDate: IsoDateSchema.optional(),
  stationId: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.union([z.uuid(), z.literal('unassigned')]).optional(),
  ),
  state: z.enum(['open', 'done', 'all']).default('open'),
  pageSize: z.coerce.number().int().min(1).max(100).default(80),
});
export type KitchenQuery = z.infer<typeof KitchenQuerySchema>;
export type KitchenUrgency = 'DONE' | 'LATE' | 'AT_RISK' | 'ON_TRACK';
export function kitchenUrgency(
  plannedAt: Date,
  startedAt: Date | null,
  doneAt: Date | null,
  now: Date,
  atRiskMinutes: number,
): KitchenUrgency {
  if (doneAt) return 'DONE';
  const remaining = plannedAt.getTime() - now.getTime();
  if (remaining < 0) return 'LATE';
  if (!startedAt && remaining <= atRiskMinutes * 60_000) return 'AT_RISK';
  return 'ON_TRACK';
}
export type KitchenUnit = {
  id: string;
  stationId: string | null;
  stationName: string;
  dishName: string;
  sku: string;
  temperature: 'HOT' | 'COLD';
  quantity: number;
  choices: { name: string; groupName: string }[];
  orderId: string;
  orderNumber: string;
  orderVersion: number;
  employeeName: string;
  companyName: string;
  packagingName: string;
  notes: string;
  deliveryTimeMinutes: number;
  plannedKitchenReadyAt: string;
  plannedDispatchReadyAt: string;
  startedAt: string | null;
  doneAt: string | null;
  urgency: KitchenUrgency;
};
export type KitchenStationSummary = {
  id: string | null;
  name: string;
  total: number;
  started: number;
  done: number;
  late: number;
  atRisk: number;
};
export type KitchenBoard = {
  deliveryDate: string;
  asOf: string;
  atRiskMinutes: number;
  stations: KitchenStationSummary[];
  units: Paginated<KitchenUnit>;
};
