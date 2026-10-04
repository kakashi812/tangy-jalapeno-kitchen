import { describe, expect, it } from 'vitest';
import { demoRandom, demoStatus, demoWeekStart, demoWorkingDates } from './demo.js';
const weekdays = { workingDays: [1, 2, 3, 4, 5], holidays: [] };
describe('append-only calendar-safe demo planning', () => {
  it('Sunday belongs to the preceding Monday week', () =>
    expect(demoWeekStart('2026-10-04')).toBe('2026-09-28'));
  it('respects both calendars/holidays and never adds weekend deliveries', () =>
    expect(
      demoWorkingDates(
        '2026-10-05',
        { ...weekdays, holidays: [{ startDate: '2026-10-06', endDate: '2026-10-06' }] },
        {
          workingDays: [1, 2, 3, 4, 5, 6],
          holidays: [{ startDate: '2026-10-07', endDate: '2026-10-08' }],
        },
      ),
    ).toEqual(['2026-10-05', '2026-10-09']));
  it('is deterministic per coverage week without modifying previous records', () => {
    const a = demoRandom('week-a'),
      b = demoRandom('week-a'),
      c = demoRandom('week-b');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(a()).not.toBe(c());
  });
  it('future drafts/placed are allowed only while their saved cutoff is open', () => {
    const now = new Date('2026-10-04T10:00:00Z');
    expect(demoStatus('2026-10-09', '2026-10-04', new Date('2026-10-07'), now, 0)).toBe('DRAFT');
    expect(demoStatus('2026-10-09', '2026-10-04', new Date('2026-10-07'), now, 1)).toBe('PLACED');
    expect(demoStatus('2026-10-05', '2026-10-04', new Date('2026-10-01'), now, 0)).toBe(
      'CONFIRMED',
    );
  });
  it('historical examples include delivered/cancelled/rejected and unfinished confirmed work', () => {
    const now = new Date('2026-10-04');
    expect(
      Array.from({ length: 6 }, (_, i) => demoStatus('2026-10-01', '2026-10-04', now, now, i)),
    ).toEqual(['DELIVERED', 'DELIVERED', 'DELIVERED', 'CANCELLED', 'REJECTED', 'CONFIRMED']);
  });
});
