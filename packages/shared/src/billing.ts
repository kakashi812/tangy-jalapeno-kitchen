import { z } from 'zod';
import { PageQuerySchema, type Paginated } from './pagination.js';
import { isIsoDate, kitchenToday } from './kitchen-time.js';

const optionalId = z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional());
export const BillingQuerySchema = PageQuerySchema.extend({
  companyId: optionalId,
  through: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().refine(isIsoDate, 'Choose a valid date').optional(),
  ),
  status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['UNPAID', 'PAID']).optional()),
  review: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['true', 'false']).optional()),
});
export type BillingQuery = z.infer<typeof BillingQuerySchema>;
export const InvoiceCreateSchema = z
  .object({
    companyId: z.uuid(),
    orders: z
      .array(z.object({ id: z.uuid(), version: z.number().int().nonnegative() }))
      .min(1, 'Select at least one order')
      .max(100),
  })
  .refine((v) => new Set(v.orders.map((o) => o.id)).size === v.orders.length, {
    path: ['orders'],
    message: 'Select each order only once',
  });
export type InvoiceCreate = z.infer<typeof InvoiceCreateSchema>;
export const InvoicePaySchema = z.object({ version: z.number().int().nonnegative() });
export const ShortDeliverySchema = InvoicePaySchema.extend({
  note: z.string().trim().min(1, 'Explain what was missing').max(2000),
});
export type BillingOrder = {
  id: string;
  number: string;
  employeeName: string;
  companyName: string;
  deliveryDate: string;
  status: string;
  totalCents: number;
  version: number;
  billingReviewReason: string;
  shortDeliveryNote: string;
};
export type InvoiceSummary = {
  id: string;
  number: string;
  company: { id: string; name: string };
  totalCents: number;
  orderCount: number;
  issuedAt: string;
  paidAt: string | null;
  version: number;
  needsReview: boolean;
};
export type InvoiceDetail = InvoiceSummary & {
  billingContactName: string;
  billingEmail: string;
  orders: Paginated<BillingOrder>;
};
export function invoiceNumber(sequence: number, issuedAt: Date): string {
  return `INV-${kitchenToday(issuedAt).slice(0, 4)}-${String(sequence).padStart(4, '0')}`;
}
export function invoiceTotal(amounts: readonly number[]): number {
  if (!amounts.length || amounts.some((n) => !Number.isSafeInteger(n) || n < 0))
    throw new RangeError('Invoice needs valid order amounts');
  const sum = amounts.reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(sum) || sum > 2_147_483_647)
    throw new RangeError('Invoice total exceeds the supported amount; select fewer orders');
  return sum;
}
