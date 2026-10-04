import { describe, expect, it } from 'vitest';
import type { MenuDish } from './menu.js';
import {
  combinationKey,
  mergeCombinations,
  OrderInputSchema,
  OrderRuleError,
  orderNumber,
  sameLine,
  snapshotLine,
  validateSnapshot,
  type OrderLineInput,
} from './orders.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const dish = (extra: Partial<MenuDish> = {}): MenuDish => ({
  menuItemId: id(1),
  dishId: id(2),
  name: 'Paneer bowl',
  description: '',
  sku: 'BWL-PAN',
  imageUrl: null,
  temperature: 'HOT',
  minOrderQty: null,
  priceCents: 895,
  allergens: [],
  dietaryTags: [],
  allergyConflicts: [],
  fitsDiet: null,
  groups: [
    {
      id: id(3),
      name: 'Rice',
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: id(4), name: 'Brown rice', priceCents: 105, allergens: [], allergyConflicts: [] },
        { id: id(5), name: 'Jeera rice', priceCents: 55, allergens: [], allergyConflicts: [] },
      ],
    },
  ],
  ...extra,
});
const input = (extra: Partial<OrderLineInput> = {}): OrderLineInput => ({
  menuItemId: id(1),
  quantity: 10,
  combinations: [
    { quantity: 6, optionIds: [id(4)] },
    { quantity: 4, optionIds: [id(5)] },
  ],
  ...extra,
});

describe('order snapshots and combination counting', () => {
  it('prices each combination from the menu and sums integer cents exactly', () => {
    const line = snapshotLine(input(), dish(), 0, true);
    expect(line.combinations.map((c) => [c.quantity, c.unitPriceCents, c.totalCents])).toEqual([
      [6, 1000, 6000],
      [4, 950, 3800],
    ]);
    expect(line.totalCents).toBe(9800);
    expect(line.combinations[0]?.options[0]).toMatchObject({
      name: 'Brown rice',
      groupName: 'Rice',
      priceCents: 105,
    });
  });

  it('copies names, rules and prices rather than retaining mutable catalogue references', () => {
    const current = dish();
    const line = snapshotLine(input(), current, 0, true);
    current.name = 'Renamed';
    current.priceCents = 9999;
    current.groups[0]!.name = 'New group';
    current.groups[0]!.minSelect = 2;
    current.groups[0]!.options[0]!.name = 'New rice';
    current.groups[0]!.options[0]!.priceCents = 500;
    expect(line.name).toBe('Paneer bowl');
    expect(line.dishPriceCents).toBe(895);
    expect(line.groups[0]).toMatchObject({ name: 'Rice', minSelect: 1 });
    expect(line.combinations[0]?.options[0]).toMatchObject({ name: 'Brown rice', priceCents: 105 });
    expect(() => validateSnapshot(line, 0, true)).not.toThrow();
  });

  it('rejects quantities that do not add up, with the correct line field', () => {
    try {
      snapshotLine(input({ quantity: 11 }), dish(), 2, true);
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(OrderRuleError);
      expect((error as OrderRuleError).fieldErrors).toHaveProperty('lines.2.quantity');
    }
  });

  it('rejects identical combinations independent of option ordering', () => {
    const d = dish({ groups: [{ ...dish().groups[0]!, minSelect: 0, maxSelect: 2 }] });
    expect(() =>
      snapshotLine(
        input({
          quantity: 2,
          combinations: [
            { quantity: 1, optionIds: [id(4), id(5)] },
            { quantity: 1, optionIds: [id(5), id(4)] },
          ],
        }),
        d,
        0,
        true,
      ),
    ).toThrow(OrderRuleError);
  });

  it('rejects a repeated option even when the group allows two choices', () => {
    const d = dish({ groups: [{ ...dish().groups[0]!, maxSelect: 2 }] });
    expect(() =>
      snapshotLine(
        input({ quantity: 1, combinations: [{ quantity: 1, optionIds: [id(4), id(4)] }] }),
        d,
        0,
        true,
      ),
    ).toThrow(OrderRuleError);
  });

  it('enforces every required group on every combination', () => {
    expect(() =>
      snapshotLine(
        input({
          combinations: [
            { quantity: 6, optionIds: [id(4)] },
            { quantity: 4, optionIds: [] },
          ],
        }),
        dish(),
        0,
        true,
      ),
    ).toThrow(OrderRuleError);
  });

  it('enforces group maxima', () => {
    expect(() =>
      snapshotLine(
        input({ quantity: 1, combinations: [{ quantity: 1, optionIds: [id(4), id(5)] }] }),
        dish(),
        0,
        true,
      ),
    ).toThrow(OrderRuleError);
  });

  it('rejects options unavailable on the employee menu', () => {
    expect(() =>
      snapshotLine(
        input({ quantity: 1, combinations: [{ quantity: 1, optionIds: [id(999)] }] }),
        dish(),
        0,
        true,
      ),
    ).toThrow(OrderRuleError);
  });

  it('enforces the minimum per line, not per combination', () => {
    expect(() => snapshotLine(input(), dish({ minOrderQty: 10 }), 0, true)).not.toThrow();
    expect(() => snapshotLine(input(), dish({ minOrderQty: 11 }), 0, true)).toThrow(OrderRuleError);
  });

  it('allows incomplete draft minima but enforces them on placement', () => {
    const incomplete = input({ quantity: 1, combinations: [{ quantity: 1, optionIds: [] }] });
    const saved = snapshotLine(incomplete, dish({ minOrderQty: 5 }), 0, false);
    expect(saved.totalCents).toBe(895);
    expect(() => validateSnapshot(saved, 0, true)).toThrow(OrderRuleError);
  });

  it('still rejects invalid choices, excess selections and mismatched quantities in drafts', () => {
    expect(() => snapshotLine(input({ quantity: 11 }), dish(), 0, false)).toThrow(OrderRuleError);
    expect(() =>
      snapshotLine(
        input({ quantity: 1, combinations: [{ quantity: 1, optionIds: [id(99)] }] }),
        dish(),
        0,
        false,
      ),
    ).toThrow(OrderRuleError);
    expect(() =>
      snapshotLine(
        input({ quantity: 1, combinations: [{ quantity: 1, optionIds: [id(4), id(5)] }] }),
        dish(),
        0,
        false,
      ),
    ).toThrow(OrderRuleError);
  });

  it('treats dishes without groups as one implicit empty combination', () => {
    const line = snapshotLine(
      input({ quantity: 3, combinations: [{ quantity: 3, optionIds: [] }] }),
      dish({ groups: [] }),
      0,
      true,
    );
    expect(line.totalCents).toBe(2685);
    expect(line.combinations).toHaveLength(1);
  });

  it('rejects a mismatched menu item rather than pricing the wrong dish', () => {
    expect(() => snapshotLine(input({ menuItemId: id(99) }), dish(), 0, true)).toThrow(
      OrderRuleError,
    );
  });

  it('requires positive dish prices but permits free option choices', () => {
    expect(() => snapshotLine(input(), dish({ priceCents: 0 }), 0, true)).toThrow(OrderRuleError);
    const d = dish();
    d.groups[0]!.options[0]!.priceCents = 0;
    expect(snapshotLine(input(), d, 0, true).combinations[0]?.unitPriceCents).toBe(895);
  });

  it('rejects amounts outside the database integer range', () => {
    expect(() => snapshotLine(input(), dish({ priceCents: 300_000_000 }), 0, true)).toThrow(
      OrderRuleError,
    );
  });
});

describe('order editor helpers', () => {
  it('merges duplicate choices without mutating form inputs', () => {
    const combinations = [
      { quantity: 2, optionIds: [id(4), id(5)] },
      { quantity: 3, optionIds: [id(5), id(4)] },
    ];
    expect(mergeCombinations(combinations)).toEqual([{ quantity: 5, optionIds: [id(4), id(5)] }]);
    expect(combinations[0]?.quantity).toBe(2);
    expect(combinationKey([id(5), id(4)])).toBe(combinationKey([id(4), id(5)]));
  });

  it('recognises unchanged lines despite reordered combinations', () => {
    const line = snapshotLine(input(), dish(), 0, true);
    expect(sameLine(input({ combinations: [...input().combinations].reverse() }), line)).toBe(true);
    expect(sameLine(input({ quantity: 11 }), line)).toBe(false);
    expect(sameLine(input({ menuItemId: id(99) }), line)).toBe(false);
    expect(sameLine(input({ combinations: [{ quantity: 10, optionIds: [id(4)] }] }), line)).toBe(
      false,
    );
  });

  it('formats human-readable sequential order numbers', () => {
    expect(orderNumber(123)).toBe('FL-000123');
    expect(orderNumber(1_000_000)).toBe('FL-1000000');
  });

  it('normalises secret codes and discards client-supplied prices', () => {
    const order = OrderInputSchema.parse({
      employeeId: id(10),
      deliveryDate: '2026-10-07',
      addressId: id(11),
      deliveryTimeMinutes: 720,
      packagingTypeId: id(12),
      lines: [{ ...input(), totalCents: 1 }],
      secretCodes: [' chef2026 '],
      intent: 'place',
      totalCents: 1,
    });
    expect(order.secretCodes).toEqual(['CHEF2026']);
    expect(order).not.toHaveProperty('totalCents');
    expect(order.lines[0]).not.toHaveProperty('totalCents');
  });
});
