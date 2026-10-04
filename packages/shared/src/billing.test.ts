import { describe, expect, it } from 'vitest';
import {
  BillingQuerySchema,
  InvoiceCreateSchema,
  ShortDeliverySchema,
  invoiceNumber,
  invoiceTotal,
} from './billing.js';
const id = '00000000-0000-4000-8000-000000000001';
describe('internal billing', () => {
  it('reconciles exact cents including zero-price orders', () =>
    expect(invoiceTotal([211, 105, 0])).toBe(316));
  it('rejects empty, fractional, negative and overflowing totals', () => {
    for (const amounts of [[], [1.1], [-1], [2_147_483_647, 1]])
      expect(() => invoiceTotal(amounts)).toThrow();
  });
  it('rejects duplicate selections and requires versions', () => {
    expect(
      InvoiceCreateSchema.safeParse({
        companyId: id,
        orders: [
          { id, version: 0 },
          { id, version: 0 },
        ],
      }).success,
    ).toBe(false);
    expect(InvoiceCreateSchema.safeParse({ companyId: id, orders: [{ id }] }).success).toBe(false);
  });
  it('normalizes blank filters without losing the chosen date', () =>
    expect(
      BillingQuerySchema.parse({ companyId: '', status: '', review: '', through: '2026-10-09' })
        .through,
    ).toBe('2026-10-09'));
  it('requires an actionable short-delivery note', () =>
    expect(ShortDeliverySchema.safeParse({ version: 0, note: '  ' }).success).toBe(false));
  it('numbers invoices using the kitchen year', () =>
    expect(invoiceNumber(12, new Date('2026-12-31T20:00:00Z'))).toBe('INV-2027-0012'));
});
