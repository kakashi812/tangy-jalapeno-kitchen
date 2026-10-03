import { describe, expect, it } from 'vitest';
import {
  buildMenu,
  CategoryInputSchema,
  type MenuSourceCategory,
  type MenuSourceDish,
  type MenuViewer,
} from './menu.js';
import type { PricingContext } from './pricing.js';

const MILK = { id: 'milk', name: 'Milk' };
const VEGAN = { id: 'vegan', name: 'Vegan' };
const VEG = { id: 'veg', name: 'Vegetarian' };

const option = (
  id: string,
  extra: Partial<MenuSourceDish['groups'][number]['options'][number]> = {},
) => ({
  id,
  name: id,
  isActive: true,
  costCents: 50,
  allergens: [],
  dietaryTags: [],
  ...extra,
});

const dish = (id: string, extra: Partial<MenuSourceDish> = {}): MenuSourceDish => ({
  id,
  name: id,
  description: '',
  sku: id.toUpperCase(),
  imageUrl: null,
  temperature: 'HOT',
  isActive: true,
  costCents: 300,
  minOrderQty: null,
  allergens: [],
  dietaryTags: [VEG],
  groups: [],
  ...extra,
});

/** Standard = cost × 2 (all priced); Pilot = typed prices only. */
const pricing = (typedPilot: Record<string, number> = {}): PricingContext => ({
  tiers: new Map([
    [
      'std',
      {
        id: 'std',
        rule: 'COST_MULTIPLIER',
        multiplierBp: 20_000,
        baseTierId: null,
        percentBp: null,
      },
    ],
    [
      'pilot',
      { id: 'pilot', rule: 'MANUAL', multiplierBp: null, baseTierId: null, percentBp: null },
    ],
  ]),
  typed: new Map([['pilot', new Map(Object.entries(typedPilot))]]),
});

const viewer = (extra: Partial<MenuViewer> = {}): MenuViewer => ({
  tierId: 'std',
  hiddenCategoryIds: new Set(),
  hiddenItemIds: new Set(),
  allergyIds: new Set(),
  dietIds: new Set(),
  ...extra,
});

const category = (
  id: string,
  dishes: MenuSourceDish[],
  extra: Partial<MenuSourceCategory> = {},
): MenuSourceCategory => ({
  id,
  name: id,
  isActive: true,
  isSecret: false,
  accessCode: null,
  items: dishes.map((d) => ({ id: `${id}:${d.id}`, isActive: true, dish: d })),
  ...extra,
});

const names = (menu: ReturnType<typeof buildMenu>) =>
  menu.map((c) => `${c.name}: ${c.dishes.map((d) => d.name).join(',')}`);

describe('buildMenu visibility (decision 22)', () => {
  it('shows active, priced dishes in active categories with prices from the tier', () => {
    const menu = buildMenu([category('Bowls', [dish('bowl')])], viewer(), pricing());
    expect(menu[0]?.dishes[0]?.priceCents).toBe(600); // 300 × 2
  });

  it('hides inactive dishes, inactive menu items and inactive categories', () => {
    const cats = [
      category('A', [dish('off', { isActive: false }), dish('on')]),
      { ...category('B', [dish('b')]), isActive: false },
      { ...category('C', [dish('c')]), items: [{ id: 'C:c', isActive: false, dish: dish('c') }] },
    ];
    expect(names(buildMenu(cats, viewer(), pricing()))).toEqual(['A: on']);
  });

  it('hides categories and items hidden from the company', () => {
    const cats = [category('A', [dish('a1'), dish('a2')]), category('B', [dish('b')])];
    const menu = buildMenu(
      cats,
      viewer({ hiddenCategoryIds: new Set(['B']), hiddenItemIds: new Set(['A:a2']) }),
      pricing(),
    );
    expect(names(menu)).toEqual(['A: a1']);
  });

  it('a dish can appear in several categories', () => {
    const shared = dish('bowl');
    expect(
      names(
        buildMenu(
          [category('Bowls', [shared]), category('Bestsellers', [shared])],
          viewer(),
          pricing(),
        ),
      ),
    ).toEqual(['Bowls: bowl', 'Bestsellers: bowl']);
  });
});

describe('buildMenu pricing (brief 4.3.5, decision 1)', () => {
  it('drops a dish with no price on the tier: never shown at $0 or blank', () => {
    const menu = buildMenu(
      [category('A', [dish('priced'), dish('unpriced')])],
      viewer({ tierId: 'pilot' }),
      pricing({ priced: 700 }),
    );
    expect(names(menu)).toEqual(['A: priced']);
  });

  it('drops unpriced options, and the dish when a required group is left without enough choices', () => {
    const withGroups = dish('bowl', {
      groups: [
        {
          id: 'g1',
          name: 'Protein',
          minSelect: 1,
          maxSelect: 1,
          options: [option('paneer'), option('tofu')],
        },
        { id: 'g2', name: 'Extras', minSelect: 0, maxSelect: 2, options: [option('raita')] },
      ],
    });
    // Pilot prices the bowl and paneer only: tofu dropped, Extras group skipped, dish still shown.
    const partly = buildMenu(
      [category('A', [withGroups])],
      viewer({ tierId: 'pilot' }),
      pricing({ bowl: 800, paneer: 100 }),
    );
    expect(
      partly[0]?.dishes[0]?.groups.map((g) => `${g.name}:${g.options.map((o) => o.name)}`),
    ).toEqual(['Protein:paneer']);
    // No protein priced: the required group can't be met, so the dish disappears.
    expect(
      buildMenu([category('A', [withGroups])], viewer({ tierId: 'pilot' }), pricing({ bowl: 800 })),
    ).toEqual([]);
  });

  it('drops inactive options and caps a group maximum at what is left', () => {
    const d = dish('bowl', {
      groups: [
        {
          id: 'g',
          name: 'Sides',
          minSelect: 0,
          maxSelect: 3,
          options: [option('a'), option('b', { isActive: false })],
        },
      ],
    });
    expect(
      buildMenu([category('A', [d])], viewer(), pricing())[0]?.dishes[0]?.groups[0],
    ).toMatchObject({
      maxSelect: 1,
      options: [{ id: 'a' }],
    });
  });
});

describe('buildMenu secret categories (decision 21)', () => {
  const secret = category('Specials', [dish('special')], {
    isSecret: true,
    accessCode: 'CHEF2026',
  });

  it('leaves secret categories out unless their code is unlocked', () => {
    expect(names(buildMenu([secret], viewer(), pricing()))).toEqual([]);
    expect(names(buildMenu([secret], viewer(), pricing(), new Set(['WRONG'])))).toEqual([]);
    expect(names(buildMenu([secret], viewer(), pricing(), new Set(['CHEF2026'])))).toEqual([
      'Specials: special',
    ]);
  });

  it('still applies company hiding to an unlocked secret category', () => {
    expect(
      buildMenu(
        [secret],
        viewer({ hiddenCategoryIds: new Set(['Specials']) }),
        pricing(),
        new Set(['CHEF2026']),
      ),
    ).toEqual([]);
  });
});

describe('buildMenu allergies and diet (decision 23: warn, never hide)', () => {
  it('makes no diet claim for an employee without dietary preferences', () => {
    expect(
      buildMenu([category('A', [dish('a')])], viewer(), pricing())[0]?.dishes[0]?.fitsDiet,
    ).toBeNull();
  });

  it('flags allergen conflicts on the dish and on options, and checks the diet', () => {
    const d = dish('lassi', {
      allergens: [MILK],
      dietaryTags: [VEG],
      groups: [
        {
          id: 'g',
          name: 'Add',
          minSelect: 0,
          maxSelect: 1,
          options: [option('cream', { allergens: [MILK] })],
        },
      ],
    });
    const result = buildMenu(
      [category('Drinks', [d])],
      viewer({ allergyIds: new Set(['milk']), dietIds: new Set(['vegan']) }),
      pricing(),
    );
    const shown = result[0]!.dishes[0]!;
    expect(shown.allergyConflicts).toEqual([MILK]);
    expect(shown.groups[0]?.options[0]?.allergyConflicts).toEqual([MILK]);
    expect(shown.fitsDiet).toBe(false); // vegan wanted, dish is only vegetarian
    expect(
      buildMenu(
        [category('D', [dish('v', { dietaryTags: [VEGAN, VEG] })])],
        viewer({ dietIds: new Set(['vegan']) }),
        pricing(),
      )[0]?.dishes[0]?.fitsDiet,
    ).toBe(true);
  });
});

describe('CategoryInputSchema', () => {
  it('requires a code for secret categories, uppercases it, and drops it otherwise', () => {
    expect(
      CategoryInputSchema.safeParse({ name: 'S', isActive: true, isSecret: true, accessCode: '' })
        .success,
    ).toBe(false);
    expect(
      CategoryInputSchema.parse({
        name: 'S',
        isActive: true,
        isSecret: true,
        accessCode: ' chef2026 ',
      }).accessCode,
    ).toBe('CHEF2026');
    expect(
      CategoryInputSchema.parse({ name: 'S', isActive: true, isSecret: false, accessCode: 'X' })
        .accessCode,
    ).toBeNull();
  });
});
