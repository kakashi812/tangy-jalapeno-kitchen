/**
 * The kitchen runs in one time zone. Every "today", delivery date and cut-off is worked out in this zone,
 * never in the server's or the browser's zone.
 *
 * Representations:
 * - An instant (something happened at a moment) is a JS Date, stored as UTC.
 * - A calendar date (delivery date, holiday) is an IsoDate string "YYYY-MM-DD".
 * - A wall-clock time in the kitchen (delivery time, cut-off time) is minutes after midnight, 0–1439.
 */
export const KITCHEN_TIME_ZONE = 'Asia/Kolkata';

export type IsoDate = string;
export type MinutesOfDay = number;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function parseIsoDate(value: IsoDate): [number, number, number] {
  if (!isIsoDate(value)) throw new RangeError(`Not a valid date: "${value}"`);
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return [y, m, d];
}

function toIsoDate(y: number, m: number, d: number): IsoDate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Wall-clock parts of an instant as seen in a time zone. */
function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** How far the zone is ahead of UTC at that instant, in milliseconds (+05:30 → 19 800 000). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The calendar date it is in the kitchen at `now`. */
export function kitchenToday(
  now: Date = new Date(),
  timeZone: string = KITCHEN_TIME_ZONE,
): IsoDate {
  const p = zonedParts(now, timeZone);
  return toIsoDate(p.year, p.month, p.day);
}

/** The instant at which the kitchen's clock shows `minutes` on `date`. 2026-10-07 + 16:00 IST → 10:30Z. */
export function kitchenDateTimeToUtc(
  date: IsoDate,
  minutes: MinutesOfDay,
  timeZone: string = KITCHEN_TIME_ZONE,
): Date {
  assertMinutesOfDay(minutes);
  const [y, m, d] = parseIsoDate(date);
  const wallAsUtc = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  // First guess uses the offset at the wall time read as UTC; the second pass corrects it when a
  // daylight-saving change falls between the guess and the real instant. Asia/Kolkata has no DST,
  // but this keeps the helper correct if the zone ever changes.
  const firstGuess = wallAsUtc - zoneOffsetMs(new Date(wallAsUtc), timeZone);
  return new Date(wallAsUtc - zoneOffsetMs(new Date(firstGuess), timeZone));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = parseIsoDate(date);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return toIsoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

/** 0 = Sunday … 6 = Saturday, same as Date#getDay. */
export function dayOfWeek(date: IsoDate): number {
  const [y, m, d] = parseIsoDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function assertMinutesOfDay(minutes: number): MinutesOfDay {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) {
    throw new RangeError(`Minutes of day must be an integer 0–1439, got ${minutes}`);
  }
  return minutes;
}

/** "16:00" → 960 */
export function parseTimeOfDay(value: string): MinutesOfDay {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new RangeError(`Not a time of day (HH:mm): "${value}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 960 → "16:00" */
export function formatTimeOfDay(minutes: MinutesOfDay): string {
  assertMinutesOfDay(minutes);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
