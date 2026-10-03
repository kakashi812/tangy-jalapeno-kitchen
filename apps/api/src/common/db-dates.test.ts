import { describe, expect, it } from 'vitest';
import { fromDbDate, toDbDate } from './db-dates.js';

describe('DATE column conversion', () => {
  it('round-trips without shifting the day, whatever the server zone', () => {
    // Run the suite with TZ=America/Los_Angeles or TZ=Asia/Kolkata: the result must not change.
    expect(fromDbDate(toDbDate('2026-10-07'))).toBe('2026-10-07');
    expect(toDbDate('2026-12-31').toISOString()).toBe('2026-12-31T00:00:00.000Z');
  });
});
