import type { IsoDate } from '@fernleaf/shared';

/**
 * Calendar dates are Postgres DATE columns. Prisma hands them over as a JS Date at UTC midnight,
 * so they're converted at UTC (never local time) to and from "YYYY-MM-DD", and can't shift by a day
 * whatever zone the server runs in.
 */
export function toDbDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function fromDbDate(value: Date): IsoDate {
  return value.toISOString().slice(0, 10);
}
