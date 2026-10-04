import { describe, expect, it } from 'vitest';
import { KitchenQuerySchema, kitchenUrgency } from './kitchen.js';
const now = new Date('2026-10-05T06:00:00Z');
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
describe('kitchen urgency and query limits', () => {
  it('completed units are never late', () =>
    expect(kitchenUrgency(at(-60), at(-90), at(-70), now, 30)).toBe('DONE'));
  it('unfinished units past the plan are late even if started', () =>
    expect(kitchenUrgency(at(-1), at(-20), null, now, 30)).toBe('LATE'));
  it('includes the warning-window boundary and exact planned moment', () => {
    expect(kitchenUrgency(at(30), null, null, now, 30)).toBe('AT_RISK');
    expect(kitchenUrgency(at(0), null, null, now, 30)).toBe('AT_RISK');
  });
  it('started units inside the warning window remain on track', () =>
    expect(kitchenUrgency(at(10), at(-1), null, now, 30)).toBe('ON_TRACK'));
  it('unstarted work beyond the window remains on track', () =>
    expect(kitchenUrgency(at(31), null, null, now, 30)).toBe('ON_TRACK'));
  it('bounds board payloads and validates station/date filters', () => {
    expect(KitchenQuerySchema.parse({}).pageSize).toBe(80);
    expect(KitchenQuerySchema.safeParse({ pageSize: 401 }).success).toBe(false);
    expect(
      KitchenQuerySchema.safeParse({ stationId: 'unassigned', deliveryDate: '2026-10-05' }).success,
    ).toBe(true);
    expect(KitchenQuerySchema.safeParse({ stationId: 'bad' }).success).toBe(false);
  });
  it('accepts the empty all-stations GET-form value without losing the selected date', () => {
    const query = KitchenQuerySchema.parse({ stationId: '', deliveryDate: '2026-10-05' });
    expect(query.stationId).toBeUndefined();
    expect(query.deliveryDate).toBe('2026-10-05');
  });
});
