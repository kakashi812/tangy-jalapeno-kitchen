import { z } from 'zod';
import type { Cents } from './money.js';
import { PageQuerySchema } from './pagination.js';

/**
 * How a price tier gets its prices (brief 4.3):
 * - MANUAL: every price is typed in; anything not typed has no price.
 * - COST_MULTIPLIER: price = cost × k (e.g. 2.4), rounded up to the next 5 cents.
 * - TIER_PERCENT: price = another tier's price ± p% (e.g. Standard + 15%), rounded up to 5 cents.
 * On a derived tier, a typed price is an override and wins over the rule.
 *
 * Factors are stored as integer basis points (1/100 of a percent), so all maths stays in integers:
 * × 2.4 is 24 000 bp; +15% is 1 500 bp; −10% is −1 000 bp.
 */
export const PRICE_RULES = ['MANUAL', 'COST_MULTIPLIER', 'TIER_PERCENT'] as const;
export type PriceRule = (typeof PRICE_RULES)[number];

export const BP_PER_UNIT = 10_000;

export type TierRule = {
  id: string;
  rule: PriceRule;
  /** COST_MULTIPLIER: k in basis points (2.4 → 24 000). */
  multiplierBp: number | null;
  /** TIER_PERCENT: the tier this one is based on… */
  baseTierId: string | null;
  /** …and the change in basis points (+15% → 1 500, −10% → −1 000). */
  percentBp: number | null;
};

/** Where a price came from, shown in the tier editor. */
export type PriceSource = 'manual' | 'override' | 'derived';

export type ResolvedPrice = { cents: Cents; source: PriceSource } | null;

/** Integer ceil(n / d) for n ≥ 0, d > 0, without floating point. */
function ceilDiv(n: number, d: number): number {
  return Math.floor((n + d - 1) / d);
}

/**
 * amount × factorBp / 10 000, rounded **up** to the next 5 cents, computed exactly in integers:
 * ceil(amount × factorBp / 50 000) × 5. An exact multiple of 5 stays where it is.
 * 310 × 24 000 bp → 744 → 745.
 */
export function applyFactorRoundUp5(amountCents: Cents, factorBp: number): Cents {
  return ceilDiv(amountCents * factorBp, BP_PER_UNIT * 5) * 5;
}

/** Everything resolution needs, loaded once per request. */
export type PricingContext = {
  tiers: Map<string, TierRule>;
  /** Typed prices: tierId → itemId → cents. On MANUAL tiers they're the prices; elsewhere overrides. */
  typed: Map<string, Map<string, Cents>>;
};

/**
 * The price of one dish or option on a tier, or null if it has none there (and so must not be
 * offered, brief 4.3.5). Follows TIER_PERCENT chains; a cycle (which saving refuses anyway) or a
 * missing base resolves to null rather than looping.
 */
export function resolvePrice(
  tierId: string,
  item: { id: string; costCents: Cents },
  context: PricingContext,
  seen: Set<string> = new Set(),
): ResolvedPrice {
  const tier = context.tiers.get(tierId);
  if (!tier || seen.has(tierId)) return null;

  const typed = context.typed.get(tierId)?.get(item.id);
  if (typed !== undefined)
    return { cents: typed, source: tier.rule === 'MANUAL' ? 'manual' : 'override' };

  switch (tier.rule) {
    case 'MANUAL':
      return null;
    case 'COST_MULTIPLIER':
      return tier.multiplierBp === null
        ? null
        : { cents: applyFactorRoundUp5(item.costCents, tier.multiplierBp), source: 'derived' };
    case 'TIER_PERCENT': {
      if (tier.baseTierId === null || tier.percentBp === null) return null;
      const base = resolvePrice(tier.baseTierId, item, context, new Set(seen).add(tierId));
      return base === null
        ? null
        : {
            cents: applyFactorRoundUp5(base.cents, BP_PER_UNIT + tier.percentBp),
            source: 'derived',
          };
    }
  }
}

/** What the rule alone would give (ignoring this tier's own override), for comparison in the editor. */
export function resolveRulePrice(
  tierId: string,
  item: { id: string; costCents: Cents },
  context: PricingContext,
): Cents | null {
  const typed = new Map(context.typed);
  typed.set(
    tierId,
    new Map([...(context.typed.get(tierId) ?? [])].filter(([id]) => id !== item.id)),
  );
  return resolvePrice(tierId, item, { ...context, typed })?.cents ?? null;
}

/** True if making `tierId` derive from `baseTierId` would create a loop (A → B → … → A). */
export function createsCycle(
  tierId: string,
  baseTierId: string,
  tiers: Map<string, TierRule>,
): boolean {
  let current: string | null = baseTierId;
  const seen = new Set<string>();
  while (current !== null) {
    if (current === tierId) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    const tier = tiers.get(current);
    current = tier?.rule === 'TIER_PERCENT' ? tier.baseTierId : null;
  }
  return false;
}

/** "Prices typed in", "Cost × 2.4", "Standard + 15%", "Standard − 10%". */
export function describeRule(tier: TierRule, tierName: (id: string) => string): string {
  switch (tier.rule) {
    case 'MANUAL':
      return 'Prices typed in';
    case 'COST_MULTIPLIER':
      return `Cost × ${formatBp(tier.multiplierBp ?? 0)}`;
    case 'TIER_PERCENT': {
      const pct = (tier.percentBp ?? 0) / 100;
      const sign = pct < 0 ? '−' : '+';
      return `${tierName(tier.baseTierId ?? '')} ${sign} ${Math.abs(pct)}%`;
    }
  }
}

/** 24 000 → "2.4" */
export function formatBp(bp: number): string {
  return String(bp / BP_PER_UNIT);
}

// ─── API shapes ─────────────────────────────────────────────────────────────────────────────

/** "2.4" → 24 000 bp; "15" (percent) → 1 500 bp. Parsed from text so no float errors creep in. */
function decimalToBp(scale: number) {
  return (value: string) => {
    const match = /^(-)?(\d+)(?:\.(\d{1,4}))?$/.exec(value.trim());
    if (!match) return NaN;
    const [, sign, whole = '0', fraction = ''] = match;
    const units =
      Number(whole) * scale + Math.round(Number(fraction.padEnd(4, '0')) / (10_000 / scale));
    return sign ? -units : units;
  };
}
export const multiplierToBp = decimalToBp(BP_PER_UNIT);
export const percentToBp = decimalToBp(100);

export const TierInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name').max(50, 'Name is too long'),
    description: z.string().trim().max(200, 'Description is too long').default(''),
    rule: z.enum(PRICE_RULES),
    /** COST_MULTIPLIER only: 1.00× to 20×. */
    multiplierBp: z.number().int().min(10_000, 'At least 1').max(200_000, 'At most 20').nullable(),
    /** TIER_PERCENT only. */
    baseTierId: z.uuid().nullable(),
    /** TIER_PERCENT only: −90% to +500%. */
    percentBp: z
      .number()
      .int()
      .min(-9_000, 'At most a 90% discount')
      .max(50_000, 'At most +500%')
      .nullable(),
  })
  .superRefine((tier, ctx) => {
    if (tier.rule === 'COST_MULTIPLIER' && tier.multiplierBp === null) {
      ctx.addIssue({ code: 'custom', path: ['multiplierBp'], message: 'Enter the multiplier' });
    }
    if (tier.rule === 'TIER_PERCENT') {
      if (tier.baseTierId === null)
        ctx.addIssue({
          code: 'custom',
          path: ['baseTierId'],
          message: 'Choose the tier to base it on',
        });
      if (tier.percentBp === null)
        ctx.addIssue({ code: 'custom', path: ['percentBp'], message: 'Enter the percentage' });
    }
  })
  // Fields for other rules are cleared, so a tier never carries a stale multiplier or base.
  .transform((tier) => ({
    ...tier,
    multiplierBp: tier.rule === 'COST_MULTIPLIER' ? tier.multiplierBp : null,
    baseTierId: tier.rule === 'TIER_PERCENT' ? tier.baseTierId : null,
    percentBp: tier.rule === 'TIER_PERCENT' ? tier.percentBp : null,
  }));
export type TierInput = z.input<typeof TierInputSchema>;

export type TierSummary = TierRule & {
  name: string;
  description: string;
  isDefault: boolean;
  ruleLabel: string;
  /** Active dishes with no price on this tier: they don't appear on its menus. */
  missingDishes: number;
  activeDishes: number;
  companyCount: number;
};

export const PRICE_ITEM_KINDS = ['dishes', 'options'] as const;
export type PriceItemKind = (typeof PRICE_ITEM_KINDS)[number];

export const PriceGridQuerySchema = PageQuerySchema.extend({
  kind: z.enum(PRICE_ITEM_KINDS).default('dishes'),
  q: z.string().trim().max(100).optional(),
  /** Only rows without a price on this tier. */
  missing: z.enum(['true', 'false']).default('false'),
});
export type PriceGridQuery = z.infer<typeof PriceGridQuerySchema>;

export type PriceGridRow = {
  id: string;
  name: string;
  sku: string | null;
  costCents: Cents;
  isActive: boolean;
  /** The price on this tier (null = none: not offered on this tier). */
  price: ResolvedPrice;
  /** What the tier's rule alone gives (null on manual tiers or when the base has no price). */
  ruleCents: Cents | null;
};

/** Typed prices to save: a number sets the price (or override); null removes it. */
export const SetPricesSchema = z.object({
  kind: z.enum(PRICE_ITEM_KINDS),
  prices: z
    .array(
      z.object({
        itemId: z.uuid(),
        priceCents: z
          .number()
          .int()
          .min(0, "Can't be negative")
          .max(1_000_000, 'Too large')
          .nullable(),
      }),
    )
    .min(1)
    .max(500),
});
export type SetPricesInput = z.infer<typeof SetPricesSchema>;

/** A dish's price on every tier (the dish card's "Prices" button). */
export type ItemTierPrice = {
  tier: { id: string; name: string; isDefault: boolean };
  price: ResolvedPrice;
};
