import { z } from 'zod';
import {
  addDays,
  dayOfWeek,
  isIsoDate,
  kitchenDateTimeToUtc,
  KITCHEN_TIME_ZONE,
  type IsoDate,
  type MinutesOfDay,
} from './kitchen-time.js';

export const IsoDateSchema = z.string().refine(isIsoDate, 'Enter a valid date (YYYY-MM-DD)');

/** 0 = Sunday … 6 = Saturday (same as Date#getDay). */
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** A closed period, inclusive of both dates. */
export type DateRange = { startDate: IsoDate; endDate: IsoDate };

export type KitchenCalendar = {
  /** Weekdays the kitchen works, 0 = Sunday … 6 = Saturday. */
  workingDays: number[];
  holidays: DateRange[];
};

export type CutoffRule = {
  /** How many kitchen working days before delivery the orders lock. */
  daysBefore: number;
  /** Kitchen wall-clock time of the lock, minutes after midnight. */
  timeMinutes: MinutesOfDay;
};

export function isInRange(date: IsoDate, range: DateRange): boolean {
  // ISO dates compare correctly as strings.
  return range.startDate <= date && date <= range.endDate;
}

export function isKitchenWorkingDay(date: IsoDate, calendar: KitchenCalendar): boolean {
  return (
    calendar.workingDays.includes(dayOfWeek(date)) &&
    !calendar.holidays.some((holiday) => isInRange(date, holiday))
  );
}

/** Guards against a calendar with no working days at all (the loop would never end). */
const MAX_DAYS_SEARCHED = 366;

/**
 * The moment orders for `deliveryDate` lock (brief 4.6).
 *
 * Count back `daysBefore` kitchen working days from the delivery date (the delivery day itself is
 * not counted), skipping kitchen non-working days and holidays, then lock at the cut-off time in
 * kitchen time. With 2 days at 16:00, a Wednesday delivery locks on Monday at 16:00; if Tuesday is a
 * holiday it locks on Friday at 16:00.
 *
 * Only the kitchen calendar moves the cut-off; the company's calendar never does.
 */
export function computeCutoff(
  deliveryDate: IsoDate,
  rule: CutoffRule,
  calendar: KitchenCalendar,
  timeZone: string = KITCHEN_TIME_ZONE,
): Date {
  let day = deliveryDate;
  let counted = 0;
  let searched = 0;
  while (counted < rule.daysBefore) {
    day = addDays(day, -1);
    if (++searched > MAX_DAYS_SEARCHED) {
      throw new RangeError('The kitchen calendar has no working days to count back through');
    }
    if (isKitchenWorkingDay(day, calendar)) counted++;
  }
  return kitchenDateTimeToUtc(day, rule.timeMinutes, timeZone);
}
