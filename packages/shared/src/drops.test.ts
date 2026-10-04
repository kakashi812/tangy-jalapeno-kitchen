import { describe, expect, it } from 'vitest';
import { DeliveryInputSchema, DropQuerySchema, deliveryOnTime, dropState } from './drops.js';
describe('drop rules', () => {
  it('shows kitchen ready only for a nonempty fully ready waiting drop', () => {
    expect(dropState('WAITING', 3, 3)).toBe('KITCHEN_READY');
    expect(dropState('WAITING', 3, 2)).toBe('WAITING');
    expect(dropState('WAITING', 0, 0)).toBe('WAITING');
    expect(dropState('DISPATCH_READY', 3, 3)).toBe('DISPATCH_READY');
  });
  it('records exact-boundary on-time without tolerance', () => {
    const planned = new Date('2026-10-05T07:00:00Z');
    expect(deliveryOnTime(planned, planned)).toBe(true);
    expect(deliveryOnTime(new Date(planned.getTime() - 1), planned)).toBe(true);
    expect(deliveryOnTime(new Date(planned.getTime() + 1), planned)).toBe(false);
  });
  it('validates multipart version/note and ignores unsolicited photo URLs', () => {
    expect(
      DeliveryInputSchema.parse({
        version: '3',
        note: ' Done ',
        photoUrl: 'https://untrusted.example',
      }),
    ).toEqual({ version: 3, note: 'Done' });
    expect(DeliveryInputSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(DeliveryInputSchema.safeParse({ version: 1, note: 'x'.repeat(2001) }).success).toBe(
      false,
    );
  });
  it('preserves date when filters are blank and bounds pages', () => {
    expect(
      DropQuerySchema.parse({ deliveryDate: '2026-10-05', companyId: '', state: '' }).deliveryDate,
    ).toBe('2026-10-05');
    expect(DropQuerySchema.safeParse({ pageSize: 401 }).success).toBe(false);
  });
});
