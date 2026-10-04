import { z } from 'zod';
import { IsoDateSchema } from './calendar.js';
import { DeliveryTimeSchema } from './companies.js';
import { AccessCodeSchema, type EmployeeMenu, type MenuDish } from './menu.js';
import type { Cents } from './money.js';
import { PageQuerySchema } from './pagination.js';

export const ORDER_STATUSES = [
  'DRAFT',
  'PLACED',
  'CONFIRMED',
  'DELIVERED',
  'CANCELLED',
  'REJECTED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const CombinationInputSchema = z.object({
  quantity: z.number().int().min(1).max(500),
  optionIds: z.array(z.uuid()).max(200),
});
export const OrderLineInputSchema = z.object({
  id: z.uuid().optional(),
  menuItemId: z.uuid(),
  quantity: z.number().int().min(1).max(500),
  combinations: z.array(CombinationInputSchema).min(1).max(100),
});
export type OrderLineInput = z.infer<typeof OrderLineInputSchema>;
export const OrderInputSchema = z.object({
  employeeId: z.uuid(),
  deliveryDate: IsoDateSchema,
  addressId: z.uuid(),
  deliveryTimeMinutes: DeliveryTimeSchema,
  packagingTypeId: z.uuid(),
  notes: z.string().trim().max(500).default(''),
  lines: z.array(OrderLineInputSchema).max(100),
  secretCodes: z.array(AccessCodeSchema).max(20).default([]),
  intent: z.enum(['draft', 'place']),
  version: z.number().int().min(0).optional(),
});
export type OrderInput = z.infer<typeof OrderInputSchema>;
export const OrderListQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  from: IsoDateSchema.optional(),
  to: IsoDateSchema.optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  companyId: z.uuid().optional(),
  invoiced: z.enum(['true', 'false']).optional(),
});
export type OrderListQuery = z.infer<typeof OrderListQuerySchema>;
export const OrderActionSchema = z.object({
  version: z.number().int().min(0),
  reason: z.string().trim().max(500).default(''),
});
export const OrderOverrideSchema = z.object({
  version: z.number().int().min(0),
  addressId: z.uuid(),
  deliveryTimeMinutes: DeliveryTimeSchema,
  packagingTypeId: z.uuid(),
  reason: z.string().trim().min(1, 'Explain the override').max(500),
});
export const CloseOrdersSchema = z.object({ deliveryDate: IsoDateSchema });
export const OrderContextQuerySchema = z.object({
  employeeId: z.uuid(),
  deliveryDate: IsoDateSchema,
  codes: z.string().max(420).optional(),
});
export const OrderEmployeeQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().max(100).default(''),
});
export type OrderEmployeeChoice = {
  id: string;
  name: string;
  email: string;
  company: { name: string };
};
export type OverrideChoices = {
  addresses: { id: string; label: string }[];
  packagingTypes: { id: string; name: string }[];
};

export type SavedChoice = {
  id: string;
  name: string;
  groupId: string;
  groupName: string;
  priceCents: Cents;
};
export type SavedCombination = {
  quantity: number;
  options: SavedChoice[];
  unitPriceCents: Cents;
  totalCents: Cents;
};
export type LineSnapshot = {
  menuItemId: string;
  dishId: string;
  name: string;
  sku: string;
  temperature: 'HOT' | 'COLD';
  stationId: string | null;
  stationName: string | null;
  minOrderQty: number | null;
  quantity: number;
  dishPriceCents: Cents;
  groups: { id: string; name: string; minSelect: number; maxSelect: number }[];
  combinations: SavedCombination[];
  totalCents: Cents;
};
export type OrderLine = LineSnapshot & { id: string; combinationIds: string[] };
/** Money is omitted by the API for read-only kitchen/dispatch access. */
export type VisibleOrderLine = Omit<OrderLine, 'dishPriceCents' | 'totalCents' | 'combinations'> & {
  dishPriceCents?: number;
  totalCents?: number;
  combinations: (Omit<SavedCombination, 'unitPriceCents' | 'totalCents' | 'options'> & {
    unitPriceCents?: number;
    totalCents?: number;
    options: (Omit<SavedChoice, 'priceCents'> & { priceCents?: number })[];
  })[];
};
export type OrderSummary = {
  id: string;
  number: string;
  employee: { id: string; name: string };
  company: { id: string; name: string };
  deliveryDate: string;
  deliveryTimeMinutes: number;
  status: OrderStatus;
  totalCents?: number;
  invoiced: boolean;
  kitchenStartedAt: string | null;
  kitchenReadyAt: string | null;
};
export type OrderDetail = OrderSummary & {
  version: number;
  cutoffAt: string;
  locked: boolean;
  addressId: string;
  addressText: string;
  packagingTypeId: string;
  packagingName: string;
  notes: string;
  driverInstructions: string;
  dispatchLeadMinutes: number;
  plannedKitchenReadyAt: string;
  plannedDispatchReadyAt: string;
  outForDeliveryAt: string | null;
  lines: VisibleOrderLine[];
  events: { id: string; type: string; description: string; at: string; actor: string | null }[];
  permissions: {
    edit: boolean;
    place: boolean;
    cancel: boolean;
    reject: boolean;
    override: boolean;
  };
};
export type OrderContext = {
  menu: EmployeeMenu;
  addresses: { id: string; label: string; text: string; isDefault: boolean }[];
  packagingTypes: { id: string; name: string }[];
  defaults: { addressId: string; deliveryTimeMinutes: number; packagingTypeId: string };
  flags: { canChooseAddress: boolean; canChangeDeliveryTime: boolean; canChangePackaging: boolean };
  cutoffAt: string;
  closed: boolean;
  companyActive: boolean;
  deliveryDate: string;
  deliveryWindowStartMinutes: number;
  deliveryWindowEndMinutes: number;
};

export class OrderRuleError extends Error {
  constructor(public readonly fieldErrors: Record<string, string[]>) {
    super('Some order fields are invalid');
  }
}
export function combinationKey(optionIds: readonly string[]): string {
  return [...optionIds].sort().join('|');
}
export function mergeCombinations(combinations: z.infer<typeof CombinationInputSchema>[]) {
  const merged = new Map<string, z.infer<typeof CombinationInputSchema>>();
  for (const c of combinations) {
    const key = combinationKey(c.optionIds);
    const prior = merged.get(key);
    if (prior) prior.quantity += c.quantity;
    else merged.set(key, { quantity: c.quantity, optionIds: [...c.optionIds] });
  }
  return [...merged.values()];
}

/** Snapshots contain all the rules needed to place an existing draft, even after catalogue edits. */
export function validateSnapshot(line: LineSnapshot, index: number, strict: boolean): void {
  const errors: Record<string, string[]> = {};
  const at = `lines.${index}`;
  if (line.combinations.reduce((n, c) => n + c.quantity, 0) !== line.quantity)
    errors[`${at}.quantity`] = ['Combination quantities must add up to the line quantity'];
  if (strict && line.minOrderQty && line.quantity < line.minOrderQty)
    errors[`${at}.quantity`] = [`Order at least ${line.minOrderQty} of ${line.name}`];
  const seen = new Set<string>();
  line.combinations.forEach((c, ci) => {
    const key = combinationKey(c.options.map((o) => o.id));
    if (seen.has(key)) errors[`${at}.combinations.${ci}`] = ['Merge identical combinations'];
    seen.add(key);
    if (new Set(c.options.map((o) => o.id)).size !== c.options.length)
      errors[`${at}.combinations.${ci}`] = ['An option cannot be chosen twice'];
    for (const g of line.groups) {
      const count = c.options.filter((o) => o.groupId === g.id).length;
      if (count > g.maxSelect || (strict && count < g.minSelect))
        errors[`${at}.combinations.${ci}.optionIds`] = [
          `${g.name}: choose ${g.minSelect}–${g.maxSelect} options`,
        ];
    }
  });
  if (Object.keys(errors).length) throw new OrderRuleError(errors);
}

/** Prices submitted by clients are never accepted; every amount comes from the employee's menu. */
export function snapshotLine(
  input: OrderLineInput,
  dish: MenuDish,
  index: number,
  strict: boolean,
): LineSnapshot {
  if (input.menuItemId !== dish.menuItemId)
    throw new OrderRuleError({
      [`lines.${index}.menuItemId`]: ['This dish does not match the selected menu item'],
    });
  if (!Number.isSafeInteger(dish.priceCents) || dish.priceCents <= 0)
    throw new OrderRuleError({
      [`lines.${index}.menuItemId`]: ['This dish does not have a valid selling price'],
    });
  const allOptions = new Map(
    dish.groups.flatMap((g) =>
      g.options.map((o) => [o.id, { ...o, groupId: g.id, groupName: g.name }] as const),
    ),
  );
  const combinations = input.combinations.map((c, ci) => {
    const options = c.optionIds.map((id) => {
      const option = allOptions.get(id);
      if (!option)
        throw new OrderRuleError({
          [`lines.${index}.combinations.${ci}.optionIds`]: [
            'An option is unavailable on this employee’s menu',
          ],
        });
      if (!Number.isSafeInteger(option.priceCents) || option.priceCents < 0)
        throw new OrderRuleError({
          [`lines.${index}.combinations.${ci}.optionIds`]: [
            'An option does not have a valid selling price',
          ],
        });
      return {
        id,
        name: option.name,
        groupId: option.groupId,
        groupName: option.groupName,
        priceCents: option.priceCents,
      };
    });
    const unitPriceCents = dish.priceCents + options.reduce((n, o) => n + o.priceCents, 0);
    return {
      quantity: c.quantity,
      options,
      unitPriceCents,
      totalCents: unitPriceCents * c.quantity,
    };
  });
  const line: LineSnapshot = {
    menuItemId: input.menuItemId,
    dishId: dish.dishId,
    name: dish.name,
    sku: dish.sku,
    temperature: dish.temperature,
    stationId: null,
    stationName: null,
    minOrderQty: dish.minOrderQty,
    quantity: input.quantity,
    dishPriceCents: dish.priceCents,
    groups: dish.groups.map(({ id, name, minSelect, maxSelect }) => ({
      id,
      name,
      minSelect,
      maxSelect,
    })),
    combinations,
    totalCents: combinations.reduce((n, c) => n + c.totalCents, 0),
  };
  validateSnapshot(line, index, strict);
  if (!Number.isSafeInteger(line.totalCents) || line.totalCents > 2_147_483_647)
    throw new OrderRuleError({
      [`lines.${index}.quantity`]: [
        'This line exceeds the supported order amount; reduce its quantity',
      ],
    });
  return line;
}
export function sameLine(input: OrderLineInput, saved: LineSnapshot): boolean {
  return (
    input.menuItemId === saved.menuItemId &&
    input.quantity === saved.quantity &&
    JSON.stringify(
      input.combinations.map((c) => [combinationKey(c.optionIds), c.quantity]).sort(),
    ) ===
      JSON.stringify(
        saved.combinations
          .map((c) => [combinationKey(c.options.map((o) => o.id)), c.quantity])
          .sort(),
      )
  );
}
export function orderNumber(sequence: number): string {
  return `FL-${String(sequence).padStart(6, '0')}`;
}
