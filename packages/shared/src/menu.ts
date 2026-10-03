import { z } from 'zod';
import type { Cents } from './money.js';
import { resolvePrice, type PricingContext } from './pricing.js';
import type { Temperature } from './catalogue.js';

type NamedRef = { id: string; name: string };

// ─── What the builder reads ─────────────────────────────────────────────────────────────────

export type MenuSourceOption = NamedRef & {
  isActive: boolean;
  costCents: Cents;
  allergens: NamedRef[];
  dietaryTags: NamedRef[];
};

export type MenuSourceDish = NamedRef & {
  description: string;
  sku: string;
  imageUrl: string | null;
  temperature: Temperature;
  isActive: boolean;
  costCents: Cents;
  minOrderQty: number | null;
  allergens: NamedRef[];
  dietaryTags: NamedRef[];
  groups: {
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    options: MenuSourceOption[];
  }[];
};

export type MenuSourceCategory = {
  id: string;
  name: string;
  isActive: boolean;
  isSecret: boolean;
  /** Uppercase; only for secret categories. */
  accessCode: string | null;
  items: { id: string; isActive: boolean; dish: MenuSourceDish }[];
};

export type MenuViewer = {
  tierId: string;
  hiddenCategoryIds: Set<string>;
  hiddenItemIds: Set<string>;
  allergyIds: Set<string>;
  dietIds: Set<string>;
};

// ─── What the builder returns ───────────────────────────────────────────────────────────────

export type MenuOption = NamedRef & {
  priceCents: Cents;
  allergens: NamedRef[];
  /** Allergens of this option the employee is allergic to. */
  allergyConflicts: NamedRef[];
};

export type MenuGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: MenuOption[];
};

export type MenuDish = {
  menuItemId: string;
  dishId: string;
  name: string;
  description: string;
  sku: string;
  imageUrl: string | null;
  temperature: Temperature;
  minOrderQty: number | null;
  priceCents: Cents;
  allergens: NamedRef[];
  dietaryTags: NamedRef[];
  /** Dish allergens the employee is allergic to (options are flagged separately). */
  allergyConflicts: NamedRef[];
  /** The dish carries every dietary tag the employee prefers; null when they have no preferences. */
  fitsDiet: boolean | null;
  groups: MenuGroup[];
};

export type MenuCategory = { id: string; name: string; isSecret: boolean; dishes: MenuDish[] };

/**
 * Builds the menu exactly as one employee sees it (brief 4.2, 4.3; decisions 1, 21, 22, 23).
 * An item appears only if its dish, menu item and category are active, neither the category nor
 * the item is hidden from the employee's company, and the dish is priced on their tier. Options
 * without a price there are dropped; if that leaves a required group with too few choices, the
 * whole dish is dropped (it couldn't be ordered). Secret categories are left out unless their code
 * is in `unlockedCodes`. Allergies and diets only produce warnings: nothing is hidden for them.
 */
export function buildMenu(
  categories: MenuSourceCategory[],
  viewer: MenuViewer,
  pricing: PricingContext,
  unlockedCodes: Set<string> = new Set(),
): MenuCategory[] {
  const conflicts = (allergens: NamedRef[]) => allergens.filter((a) => viewer.allergyIds.has(a.id));

  const toDish = (itemId: string, dish: MenuSourceDish): MenuDish | null => {
    if (!dish.isActive) return null;
    const price = resolvePrice(viewer.tierId, dish, pricing);
    if (price === null) return null;

    const groups: MenuGroup[] = [];
    for (const group of dish.groups) {
      const options: MenuOption[] = [];
      for (const option of group.options) {
        if (!option.isActive) continue;
        const optionPrice = resolvePrice(viewer.tierId, option, pricing);
        if (optionPrice === null) continue;
        options.push({
          id: option.id,
          name: option.name,
          priceCents: optionPrice.cents,
          allergens: option.allergens,
          allergyConflicts: conflicts(option.allergens),
        });
      }
      // A required group that can't be satisfied makes the dish unorderable.
      if (options.length < group.minSelect) return null;
      if (options.length === 0) continue; // an optional group with nothing left is just skipped
      groups.push({ ...group, maxSelect: Math.min(group.maxSelect, options.length), options });
    }

    const tagIds = new Set(dish.dietaryTags.map((t) => t.id));
    return {
      menuItemId: itemId,
      dishId: dish.id,
      name: dish.name,
      description: dish.description,
      sku: dish.sku,
      imageUrl: dish.imageUrl,
      temperature: dish.temperature,
      minOrderQty: dish.minOrderQty,
      priceCents: price.cents,
      allergens: dish.allergens,
      dietaryTags: dish.dietaryTags,
      allergyConflicts: conflicts(dish.allergens),
      fitsDiet:
        viewer.dietIds.size === 0 ? null : [...viewer.dietIds].every((id) => tagIds.has(id)),
      groups,
    };
  };

  const result: MenuCategory[] = [];
  for (const category of categories) {
    if (!category.isActive || viewer.hiddenCategoryIds.has(category.id)) continue;
    if (category.isSecret && !(category.accessCode && unlockedCodes.has(category.accessCode)))
      continue;
    const dishes = category.items
      .filter((item) => item.isActive && !viewer.hiddenItemIds.has(item.id))
      .map((item) => toDish(item.id, item.dish))
      .filter((dish): dish is MenuDish => dish !== null);
    if (dishes.length > 0)
      result.push({ id: category.id, name: category.name, isSecret: category.isSecret, dishes });
  }
  return result;
}

// ─── Admin shapes ───────────────────────────────────────────────────────────────────────────

/** Access codes: 4–20 letters/digits, stored uppercase, compared case-insensitively. */
export const AccessCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(/^[A-Z0-9]{4,20}$/, 'Use 4–20 letters or digits'));

export const CategoryInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name').max(60),
    isActive: z.boolean(),
    isSecret: z.boolean(),
    accessCode: z.string().nullable(),
  })
  .superRefine((category, ctx) => {
    if (category.isSecret) {
      const code = AccessCodeSchema.safeParse(category.accessCode ?? '');
      if (!code.success) {
        ctx.addIssue({
          code: 'custom',
          path: ['accessCode'],
          message: code.error.issues[0]?.message ?? 'Enter a code',
        });
      }
    }
  })
  .transform((category) => ({
    ...category,
    accessCode: category.isSecret ? AccessCodeSchema.parse(category.accessCode ?? '') : null,
  }));
export type CategoryInput = z.input<typeof CategoryInputSchema>;

export const CategoryItemsSchema = z.object({
  items: z
    .array(z.object({ dishId: z.uuid(), isActive: z.boolean() }))
    .max(200)
    .refine(
      (items) => new Set(items.map((i) => i.dishId)).size === items.length,
      'A dish is listed twice',
    ),
});
export type CategoryItemsInput = z.infer<typeof CategoryItemsSchema>;

export const ReorderSchema = z.object({ ids: z.array(z.uuid()).min(1) });

export type AdminMenuCategory = {
  id: string;
  name: string;
  isActive: boolean;
  isSecret: boolean;
  accessCode: string | null;
  items: {
    id: string;
    isActive: boolean;
    dish: { id: string; name: string; sku: string; isActive: boolean; imageUrl: string | null };
  }[];
};

/** Which categories and items a company doesn't see (brief 4.2, 4.4). */
export const MenuHidingSchema = z.object({
  hiddenCategoryIds: z.array(z.uuid()),
  hiddenItemIds: z.array(z.uuid()),
});
export type MenuHiding = z.infer<typeof MenuHidingSchema>;

export const MenuPreviewQuerySchema = z.object({
  employeeId: z.uuid('Choose an employee'),
  /** Optional secret-category access code. */
  code: z.string().trim().max(40).optional(),
});

export type EmployeeMenu = {
  employee: { id: string; name: string; allergies: NamedRef[]; dietaryPreferences: NamedRef[] };
  company: { id: string; name: string };
  tier: { id: string; name: string };
  categories: MenuCategory[];
  /** Set when a code was given and it opened a secret category. */
  unlockedCategory: string | null;
};
