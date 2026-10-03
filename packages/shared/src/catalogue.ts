import { z } from 'zod';
import { PageQuerySchema } from './pagination.js';

// ─── Building blocks ────────────────────────────────────────────────────────────────────────

/** A money amount in integer cents (see money.ts). Costs are entered by hand, up to $10,000. */
export const CentsSchema = z
  .number({ error: 'Enter an amount' })
  .int('Use whole cents')
  .min(0, "Can't be negative")
  .max(1_000_000, 'Too large');

/** "bwl-pan-01 " → "BWL-PAN-01". Letters, digits and single hyphens. */
export const SkuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(
    z
      .string()
      .min(1, 'Enter a SKU')
      .max(30, 'SKU is too long')
      .regex(/^[A-Z0-9]+(-[A-Z0-9]+)*$/, 'Use letters, digits and hyphens, e.g. BWL-PAN-01'),
  );

const IdListSchema = z
  .array(z.uuid())
  .refine((ids) => new Set(ids).size === ids.length, 'An item is listed twice');

export const TEMPERATURES = ['HOT', 'COLD'] as const;
export const TemperatureSchema = z.enum(TEMPERATURES);
export type Temperature = z.infer<typeof TemperatureSchema>;

export type NamedRef = { id: string; name: string };

// ─── Options ────────────────────────────────────────────────────────────────────────────────

/** A reusable choice (paneer, jeera rice, raita…) with its own cost, allergens and dietary tags. */
export const OptionInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(60, 'Name is too long'),
  costCents: CentsSchema,
  allergenIds: IdListSchema,
  dietaryTagIds: IdListSchema,
  isActive: z.boolean(),
});
export type OptionInput = z.infer<typeof OptionInputSchema>;

export const OptionListQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
});
export type OptionListQuery = z.infer<typeof OptionListQuerySchema>;

export type OptionSummary = {
  id: string;
  name: string;
  /** Present only for staff who may see costs (pricing.read). */
  costCents?: number;
  isActive: boolean;
  allergens: NamedRef[];
  dietaryTags: NamedRef[];
};

export type OptionDetail = OptionSummary & {
  /** Dishes whose option groups offer this option. */
  usedBy: { id: string; name: string; sku: string }[];
};

// ─── Dishes ─────────────────────────────────────────────────────────────────────────────────

export const DishInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(80, 'Name is too long'),
  description: z.string().trim().max(500, 'Description is too long').default(''),
  sku: SkuSchema,
  temperature: TemperatureSchema,
  costCents: CentsSchema,
  /** Null = no station; the kitchen board shows it under "Unassigned". */
  stationId: z.uuid().nullable(),
  /** Optional: an order line for this dish must have at least this many (decision 10). */
  minOrderQty: z.number().int().min(2, 'Use 2 or more, or leave empty').max(500).nullable(),
  allergenIds: IdListSchema,
  dietaryTagIds: IdListSchema,
  isActive: z.boolean(),
});
export type DishInput = z.input<typeof DishInputSchema>;

export const DishListQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  stationId: z.uuid().optional(),
  temperature: TemperatureSchema.optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
});
export type DishListQuery = z.infer<typeof DishListQuerySchema>;

export type DishSummary = {
  id: string;
  name: string;
  sku: string;
  temperature: Temperature;
  imageUrl: string | null;
  station: NamedRef | null;
  isActive: boolean;
  /** Present only for staff who may see costs (pricing.read). */
  costCents?: number;
  optionGroupCount: number;
  dietaryTags: NamedRef[];
};

// ─── Option groups ──────────────────────────────────────────────────────────────────────────

/**
 * One group on a dish, e.g. "Choose your protein: paneer, tofu or chickpeas".
 * Required = minSelect ≥ 1. Options are listed in display order.
 */
export const OptionGroupInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a group name').max(60, 'Name is too long'),
    minSelect: z.number().int().min(0).max(20),
    maxSelect: z.number().int().min(1, 'Allow at least 1 choice').max(20),
    optionIds: z.array(z.uuid()).min(1, 'Add at least one option'),
  })
  .superRefine((group, ctx) => {
    if (group.maxSelect < group.minSelect) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxSelect'],
        message: 'Must be at least the minimum',
      });
    }
    if (group.minSelect > group.optionIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['minSelect'],
        message: 'More required choices than options in the group',
      });
    }
    if (new Set(group.optionIds).size !== group.optionIds.length) {
      ctx.addIssue({ code: 'custom', path: ['optionIds'], message: 'An option is listed twice' });
    }
  });
export type OptionGroupInput = z.infer<typeof OptionGroupInputSchema>;

/**
 * The full set of groups for a dish, in display order, saved in one go. An option may appear in
 * only one group of the same dish (decision 62).
 */
export const DishOptionGroupsSchema = z
  .object({ groups: z.array(OptionGroupInputSchema).max(10, 'At most 10 groups') })
  .superRefine(({ groups }, ctx) => {
    const seenIn = new Map<string, number>();
    groups.forEach((group, groupIndex) => {
      group.optionIds.forEach((optionId, optionIndex) => {
        const earlier = seenIn.get(optionId);
        if (earlier !== undefined && earlier !== groupIndex) {
          ctx.addIssue({
            code: 'custom',
            path: ['groups', groupIndex, 'optionIds', optionIndex],
            message: `This option is already in group ${earlier + 1}`,
          });
        }
        seenIn.set(optionId, groupIndex);
      });
    });
  });
export type DishOptionGroupsInput = z.infer<typeof DishOptionGroupsSchema>;

export type OptionGroupDetail = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: (NamedRef & { isActive: boolean })[];
};

export type DishDetail = DishSummary & {
  description: string;
  minOrderQty: number | null;
  allergens: NamedRef[];
  optionGroups: OptionGroupDetail[];
};

/** Image upload limits (decision 60). */
export const DISH_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const DISH_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
