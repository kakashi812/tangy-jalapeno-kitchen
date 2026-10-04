import { addDays, dayOfWeek, type IsoDate } from './kitchen-time.js';
import { isKitchenWorkingDay, type KitchenCalendar } from './calendar.js';
import type { OrderStatus } from './orders.js';
export function demoWeekStart(date: IsoDate): IsoDate {
  return addDays(date, -((dayOfWeek(date) + 6) % 7));
}
export function demoWorkingDates(
  start: IsoDate,
  kitchen: KitchenCalendar,
  company: KitchenCalendar,
): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter(
    (d) =>
      dayOfWeek(d) >= 1 &&
      dayOfWeek(d) <= 5 &&
      isKitchenWorkingDay(d, kitchen) &&
      isKitchenWorkingDay(d, company),
  );
}
/** Seeded pseudo-randomness: different weeks vary, repeated access cannot reshuffle saved records. */
export function demoRandom(key: string): () => number {
  let state = 2166136261;
  for (const c of key) state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
export function demoStatus(
  date: IsoDate,
  today: IsoDate,
  cutoffAt: Date,
  now: Date,
  variant: number,
): OrderStatus {
  if (date < today)
    return (['DELIVERED', 'DELIVERED', 'DELIVERED', 'CANCELLED', 'REJECTED', 'CONFIRMED'] as const)[
      variant % 6
    ]!;
  if (cutoffAt <= now) return 'CONFIRMED';
  return variant % 3 === 0 ? 'DRAFT' : 'PLACED';
}
