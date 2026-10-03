import { describe, expect, it } from 'vitest';
import { DishOptionGroupsSchema, OptionGroupInputSchema, SkuSchema } from './catalogue.js';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';

describe('SkuSchema', () => {
  it('normalises to uppercase and accepts hyphenated codes', () => {
    expect(SkuSchema.parse(' bwl-pan-01 ')).toBe('BWL-PAN-01');
  });
  it('rejects spaces, double hyphens and leading hyphens', () => {
    for (const bad of ['BWL PAN', 'BWL--PAN', '-BWL', '']) {
      expect(SkuSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('OptionGroupInputSchema', () => {
  const group = { name: 'Protein', minSelect: 1, maxSelect: 1, optionIds: [A, B] };

  it('accepts a required single-choice group and an optional multi-choice group', () => {
    expect(OptionGroupInputSchema.safeParse(group).success).toBe(true);
    expect(OptionGroupInputSchema.safeParse({ ...group, minSelect: 0, maxSelect: 2 }).success).toBe(
      true,
    );
  });

  it('rejects max below min, more required choices than options, and duplicates', () => {
    expect(OptionGroupInputSchema.safeParse({ ...group, minSelect: 2, maxSelect: 1 }).success).toBe(
      false,
    );
    expect(OptionGroupInputSchema.safeParse({ ...group, minSelect: 3, maxSelect: 3 }).success).toBe(
      false,
    );
    expect(OptionGroupInputSchema.safeParse({ ...group, optionIds: [A, A] }).success).toBe(false);
  });
});

describe('DishOptionGroupsSchema', () => {
  it('rejects the same option in two groups of one dish', () => {
    const result = DishOptionGroupsSchema.safeParse({
      groups: [
        { name: 'Protein', minSelect: 1, maxSelect: 1, optionIds: [A, B] },
        { name: 'Extras', minSelect: 0, maxSelect: 2, optionIds: [C, A] },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['groups', 1, 'optionIds', 1]);
  });

  it('allows a dish with no groups', () => {
    expect(DishOptionGroupsSchema.safeParse({ groups: [] }).success).toBe(true);
  });
});
