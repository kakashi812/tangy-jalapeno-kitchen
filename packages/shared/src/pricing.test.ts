import { describe, expect, it } from 'vitest';
import {
  applyFactorRoundUp5,
  createsCycle,
  multiplierToBp,
  percentToBp,
  resolvePrice,
  resolveRulePrice,
  TierInputSchema,
  type PricingContext,
  type TierRule,
} from './pricing.js';

const STANDARD: TierRule = {
  id: 'std',
  rule: 'COST_MULTIPLIER',
  multiplierBp: 24_000,
  baseTierId: null,
  percentBp: null,
};
const PARTNER: TierRule = {
  id: 'ptn',
  rule: 'TIER_PERCENT',
  multiplierBp: null,
  baseTierId: 'std',
  percentBp: 1_500,
};
const ENTERPRISE: TierRule = {
  id: 'ent',
  rule: 'TIER_PERCENT',
  multiplierBp: null,
  baseTierId: 'std',
  percentBp: -1_000,
};
const PILOT: TierRule = {
  id: 'pil',
  rule: 'MANUAL',
  multiplierBp: null,
  baseTierId: null,
  percentBp: null,
};
const VIP: TierRule = {
  id: 'vip',
  rule: 'TIER_PERCENT',
  multiplierBp: null,
  baseTierId: 'pil',
  percentBp: 1_000,
};

function context(typed: [string, string, number][] = []): PricingContext {
  const map = new Map<string, Map<string, number>>();
  for (const [tierId, itemId, cents] of typed) {
    if (!map.has(tierId)) map.set(tierId, new Map());
    map.get(tierId)!.set(itemId, cents);
  }
  return {
    tiers: new Map([STANDARD, PARTNER, ENTERPRISE, PILOT, VIP].map((t) => [t.id, t])),
    typed: map,
  };
}

const BOWL = { id: 'bowl', costCents: 310 };

describe('applyFactorRoundUp5 (round up to the next 5 cents)', () => {
  it('rounds the brief example $2.11 up to $2.15', () => {
    expect(applyFactorRoundUp5(211, 10_000)).toBe(215);
  });
  it('leaves an exact multiple of 5 cents alone', () => {
    expect(applyFactorRoundUp5(215, 10_000)).toBe(215);
    expect(applyFactorRoundUp5(250, 24_000)).toBe(600); // 2.50 × 2.4 = 6.00 exactly
  });
  it('rounds any fraction of a cent up, with no float error', () => {
    expect(applyFactorRoundUp5(310, 24_000)).toBe(745); // 7.44 → 7.45
    expect(applyFactorRoundUp5(1, 24_000)).toBe(5); // 0.024 → 0.05
    expect(applyFactorRoundUp5(0, 24_000)).toBe(0);
    expect(applyFactorRoundUp5(29, 10_000)).toBe(30); // where 0.29 × 100 would drift in floats
  });
});

describe('resolvePrice', () => {
  it('derives from cost on a multiplier tier: $3.10 × 2.4 = $7.44 → $7.45', () => {
    expect(resolvePrice('std', BOWL, context())).toEqual({ cents: 745, source: 'derived' });
  });

  it('derives from another tier: Standard $7.45 + 15% = $8.5675 → $8.60', () => {
    expect(resolvePrice('ptn', BOWL, context())).toEqual({ cents: 860, source: 'derived' });
  });

  it('applies a discount: Standard $7.45 − 10% = $6.705 → $6.75', () => {
    expect(resolvePrice('ent', BOWL, context())).toEqual({ cents: 675, source: 'derived' });
  });

  it('lets an override win on a derived tier, stored exactly (not rounded)', () => {
    expect(resolvePrice('std', BOWL, context([['std', 'bowl', 699]]))).toEqual({
      cents: 699,
      source: 'override',
    });
  });

  it('derives a dependent tier from the base tier override', () => {
    // Standard overridden to $6.99 → Partner = 6.99 × 1.15 = 8.0385 → $8.05
    expect(resolvePrice('ptn', BOWL, context([['std', 'bowl', 699]]))?.cents).toBe(805);
  });

  it('has no price on a manual tier unless typed in', () => {
    expect(resolvePrice('pil', BOWL, context())).toBeNull();
    expect(resolvePrice('pil', BOWL, context([['pil', 'bowl', 800]]))).toEqual({
      cents: 800,
      source: 'manual',
    });
  });

  it('has no price on a tier derived from a tier with no price (so the dish is hidden there)', () => {
    expect(resolvePrice('vip', BOWL, context())).toBeNull();
    expect(resolvePrice('vip', BOWL, context([['pil', 'bowl', 800]]))?.cents).toBe(880);
  });

  it('returns null for an unknown tier, and for a cycle instead of looping', () => {
    expect(resolvePrice('nope', BOWL, context())).toBeNull();
    const loop = context();
    loop.tiers.set('a', {
      id: 'a',
      rule: 'TIER_PERCENT',
      multiplierBp: null,
      baseTierId: 'b',
      percentBp: 0,
    });
    loop.tiers.set('b', {
      id: 'b',
      rule: 'TIER_PERCENT',
      multiplierBp: null,
      baseTierId: 'a',
      percentBp: 0,
    });
    expect(resolvePrice('a', BOWL, loop)).toBeNull();
  });

  it('prices a $0 option at $0 on derived tiers', () => {
    expect(resolvePrice('ptn', { id: 'mild', costCents: 0 }, context())?.cents).toBe(0);
  });
});

describe('resolveRulePrice', () => {
  it('shows what the rule would give, ignoring this tier’s override', () => {
    expect(resolveRulePrice('std', BOWL, context([['std', 'bowl', 699]]))).toBe(745);
  });
});

describe('createsCycle', () => {
  const tiers = context().tiers;
  it('detects A → B → A and self-reference', () => {
    expect(createsCycle('std', 'ptn', tiers)).toBe(true); // Partner already derives from Standard
    expect(createsCycle('std', 'std', tiers)).toBe(true);
  });
  it('allows chains without loops', () => {
    expect(createsCycle('ptn', 'ent', tiers)).toBe(false);
  });
});

describe('parsing factors', () => {
  it('reads multipliers and percentages as exact basis points', () => {
    expect(multiplierToBp('2.4')).toBe(24_000);
    expect(multiplierToBp('1.15')).toBe(11_500);
    expect(percentToBp('15')).toBe(1_500);
    expect(percentToBp('-10')).toBe(-1_000);
    expect(percentToBp('12.5')).toBe(1_250);
    expect(Number.isNaN(multiplierToBp('abc'))).toBe(true);
  });
});

describe('TierInputSchema', () => {
  it('requires the fields of the chosen rule and clears the others', () => {
    expect(
      TierInputSchema.safeParse({
        name: 'X',
        rule: 'TIER_PERCENT',
        multiplierBp: 24_000,
        baseTierId: null,
        percentBp: null,
      }).success,
    ).toBe(false);
    const parsed = TierInputSchema.parse({
      name: 'X',
      rule: 'COST_MULTIPLIER',
      multiplierBp: 24_000,
      baseTierId: '00000000-0000-4000-8000-000000000001',
      percentBp: 1_500,
    });
    expect(parsed).toMatchObject({ multiplierBp: 24_000, baseTierId: null, percentBp: null });
  });
});
