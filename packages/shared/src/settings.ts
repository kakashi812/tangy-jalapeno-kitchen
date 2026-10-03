import { z } from 'zod';
import { IsoDateSchema } from './calendar.js';
import type { IsoDate } from './kitchen-time.js';

// ─── Platform settings ──────────────────────────────────────────────────────────────────────

/** Platform-wide values staff can change without touching code or the database (brief 4.10). */
export const SettingsSchema = z.object({
  kitchenWorkingDays: z
    .array(z.number().int().min(0).max(6))
    .min(1, 'Pick at least one working day')
    .refine((days) => new Set(days).size === days.length, 'A day is listed twice'),
  cutoffDaysBefore: z.number().int().min(0, 'Use 0 or more').max(14, 'At most 14 days'),
  /** Minutes after midnight, kitchen time. */
  cutoffTimeMinutes: z.number().int().min(0).max(1439),
  /** Planned kitchen-ready = planned dispatch-ready − this (brief: 30). */
  kitchenReadyBufferMinutes: z.number().int().min(0).max(240, 'At most 240 minutes'),
  /** A unit not started within this many minutes of its planned kitchen-ready time is at risk. */
  atRiskMinutes: z.number().int().min(0).max(240, 'At most 240 minutes'),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  kitchenWorkingDays: [1, 2, 3, 4, 5],
  cutoffDaysBefore: 2,
  cutoffTimeMinutes: 16 * 60,
  kitchenReadyBufferMinutes: 30,
  atRiskMinutes: 30,
};

// ─── Kitchen holidays ───────────────────────────────────────────────────────────────────────

export const HolidayInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name').max(80, 'Name is too long'),
    startDate: IsoDateSchema,
    endDate: IsoDateSchema,
  })
  .refine((h) => h.endDate >= h.startDate, {
    path: ['endDate'],
    message: 'The end date must be on or after the start date',
  });
export type HolidayInput = z.infer<typeof HolidayInputSchema>;

export type KitchenHoliday = HolidayInput & { id: string };

/** One row of the "upcoming cut-offs" preview. */
export type CutoffPreviewDay = {
  deliveryDate: IsoDate;
  kitchenOpen: boolean;
  /** Set when the kitchen is closed for a holiday that day. */
  holidayName: string | null;
  /** When orders for this date lock (ISO instant); null when the kitchen doesn't deliver that day. */
  cutoffAt: string | null;
};

export const CutoffPreviewQuerySchema = z.object({
  from: IsoDateSchema.optional(),
  days: z.coerce.number().int().min(1).max(60).default(14),
});

// ─── Reference data ─────────────────────────────────────────────────────────────────────────

/** The admin-managed lists. The key is used in URLs (/reference/allergens). */
export const REFERENCE_KINDS = {
  allergens: { label: 'Allergens', singular: 'allergen' },
  'dietary-tags': { label: 'Dietary tags', singular: 'dietary tag' },
  stations: { label: 'Kitchen stations', singular: 'kitchen station' },
  'portion-sizes': { label: 'Portion sizes', singular: 'portion size' },
  'packaging-types': { label: 'Packaging types', singular: 'packaging type' },
} as const;
export type ReferenceKind = keyof typeof REFERENCE_KINDS;
export const ReferenceKindSchema = z.enum(
  Object.keys(REFERENCE_KINDS) as [ReferenceKind, ...ReferenceKind[]],
);

const ReferenceFields = {
  name: z.string().trim().min(1, 'Enter a name').max(50, 'Name is too long'),
  isActive: z.boolean(),
  /** Lower comes first in lists and pickers. */
  sortOrder: z.number().int().min(0).max(999),
};

export const ReferenceItemInputSchema = z.object({
  name: ReferenceFields.name,
  isActive: ReferenceFields.isActive.default(true),
  sortOrder: ReferenceFields.sortOrder.default(0),
});
export type ReferenceItemInput = z.input<typeof ReferenceItemInputSchema>;

/**
 * Built from the fields without defaults: a partial update must only change what was sent.
 * (Deriving it from the create schema would fill in isActive/sortOrder defaults on every edit.)
 */
export const ReferenceItemUpdateSchema = z.object(ReferenceFields).partial();
export type ReferenceItemUpdate = z.infer<typeof ReferenceItemUpdateSchema>;

export type ReferenceItem = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};
