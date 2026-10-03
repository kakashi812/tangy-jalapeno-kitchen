import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayOfWeek,
  formatTimeOfDay,
  isIsoDate,
  kitchenDateTimeToUtc,
  kitchenToday,
  parseTimeOfDay,
} from './kitchen-time.js';

describe('kitchenToday (Asia/Kolkata, UTC+05:30)', () => {
  it('is already the next day in the kitchen late in the UTC evening', () => {
    expect(kitchenToday(new Date('2026-10-03T18:29:59Z'))).toBe('2026-10-03');
    expect(kitchenToday(new Date('2026-10-03T18:30:00Z'))).toBe('2026-10-04');
  });

  it('does not depend on the process time zone', () => {
    // Tests run with whatever TZ the machine has; the result is fixed by the kitchen zone alone.
    expect(kitchenToday(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01');
  });
});

describe('kitchenDateTimeToUtc', () => {
  it('converts kitchen wall-clock time to the UTC instant', () => {
    expect(kitchenDateTimeToUtc('2026-10-07', 16 * 60).toISOString()).toBe(
      '2026-10-07T10:30:00.000Z',
    );
  });

  it('handles kitchen times before 05:30, which fall on the previous UTC day', () => {
    expect(kitchenDateTimeToUtc('2026-10-07', 2 * 60).toISOString()).toBe(
      '2026-10-06T20:30:00.000Z',
    );
  });

  it('stays correct across a daylight-saving change in a zone that has one', () => {
    // New York moves from EDT (-4) to EST (-5) on 2026-11-01.
    expect(kitchenDateTimeToUtc('2026-10-31', 12 * 60, 'America/New_York').toISOString()).toBe(
      '2026-10-31T16:00:00.000Z',
    );
    expect(kitchenDateTimeToUtc('2026-11-02', 12 * 60, 'America/New_York').toISOString()).toBe(
      '2026-11-02T17:00:00.000Z',
    );
  });

  it('rejects invalid input', () => {
    expect(() => kitchenDateTimeToUtc('2026-02-30', 600)).toThrow(RangeError);
    expect(() => kitchenDateTimeToUtc('2026-10-07', 1440)).toThrow(RangeError);
  });
});

describe('calendar date helpers', () => {
  it('validates real dates only', () => {
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-1-5')).toBe(false);
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('knows the day of the week', () => {
    expect(dayOfWeek('2026-10-07')).toBe(3); // Wednesday
  });
});

describe('time of day', () => {
  it('round-trips HH:mm and minutes', () => {
    expect(parseTimeOfDay('16:00')).toBe(960);
    expect(formatTimeOfDay(960)).toBe('16:00');
    expect(formatTimeOfDay(5)).toBe('00:05');
  });

  it('rejects malformed times', () => {
    expect(() => parseTimeOfDay('24:00')).toThrow(RangeError);
    expect(() => parseTimeOfDay('9:00')).toThrow(RangeError);
  });
});
