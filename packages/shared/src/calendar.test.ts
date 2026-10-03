import { describe, expect, it } from 'vitest';
import { computeCutoff, isKitchenWorkingDay, type KitchenCalendar } from './calendar.js';

const MON_FRI: KitchenCalendar = { workingDays: [1, 2, 3, 4, 5], holidays: [] };
const TWO_DAYS_AT_4PM = { daysBefore: 2, timeMinutes: 16 * 60 };

/** Cut-off as kitchen wall time, for readable assertions ("2026-10-05 16:00" = 10:30 UTC). */
const at = (iso: string) => new Date(iso).toISOString();

describe('computeCutoff', () => {
  it('matches the brief: a Wednesday delivery locks on Monday at 16:00', () => {
    // 2026-10-07 is a Wednesday. Monday 16:00 IST = 10:30 UTC.
    expect(computeCutoff('2026-10-07', TWO_DAYS_AT_4PM, MON_FRI).toISOString()).toBe(
      at('2026-10-05T10:30:00Z'),
    );
  });

  it('skips the weekend: a Monday delivery locks on the previous Thursday', () => {
    expect(computeCutoff('2026-10-12', TWO_DAYS_AT_4PM, MON_FRI).toISOString()).toBe(
      at('2026-10-08T10:30:00Z'),
    );
  });

  it('skips kitchen holidays when counting back', () => {
    const tuesdayOff = {
      ...MON_FRI,
      holidays: [{ startDate: '2026-10-06', endDate: '2026-10-06' }],
    };
    // Wed → (Tue holiday) → Mon is 1 → Fri is 2.
    expect(computeCutoff('2026-10-07', TWO_DAYS_AT_4PM, tuesdayOff).toISOString()).toBe(
      at('2026-10-02T10:30:00Z'),
    );
  });

  it('skips a multi-day holiday range', () => {
    const closedMonTue = {
      ...MON_FRI,
      holidays: [{ startDate: '2026-10-05', endDate: '2026-10-06' }],
    };
    // Wed → Tue, Mon closed → Fri is 1 → Thu is 2.
    expect(computeCutoff('2026-10-07', TWO_DAYS_AT_4PM, closedMonTue).toISOString()).toBe(
      at('2026-10-01T10:30:00Z'),
    );
  });

  it('uses the kitchen working days, e.g. a six-day kitchen', () => {
    const monSat = { workingDays: [1, 2, 3, 4, 5, 6], holidays: [] };
    // Monday delivery → Sat is 1 → Fri is 2.
    expect(computeCutoff('2026-10-12', TWO_DAYS_AT_4PM, monSat).toISOString()).toBe(
      at('2026-10-09T10:30:00Z'),
    );
  });

  it('with 0 days, locks on the delivery day itself at the cut-off time', () => {
    expect(
      computeCutoff('2026-10-07', { daysBefore: 0, timeMinutes: 9 * 60 }, MON_FRI).toISOString(),
    ).toBe(at('2026-10-07T03:30:00Z'));
  });

  it('counts across month and year boundaries', () => {
    // Monday 2027-01-04 → Fri 2027-01-01 is 1 → Thu 2026-12-31 is 2.
    expect(computeCutoff('2027-01-04', TWO_DAYS_AT_4PM, MON_FRI).toISOString()).toBe(
      at('2026-12-31T10:30:00Z'),
    );
  });

  it('refuses a calendar with no working days instead of looping forever', () => {
    expect(() =>
      computeCutoff('2026-10-07', TWO_DAYS_AT_4PM, { workingDays: [], holidays: [] }),
    ).toThrow(RangeError);
  });
});

describe('isKitchenWorkingDay', () => {
  it('is false on non-working weekdays and holidays', () => {
    const calendar = { ...MON_FRI, holidays: [{ startDate: '2026-10-06', endDate: '2026-10-06' }] };
    expect(isKitchenWorkingDay('2026-10-05', calendar)).toBe(true); // Monday
    expect(isKitchenWorkingDay('2026-10-06', calendar)).toBe(false); // holiday
    expect(isKitchenWorkingDay('2026-10-10', calendar)).toBe(false); // Saturday
  });
});
