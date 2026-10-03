import type { PriceRule } from '@fernleaf/shared';

/**
 * Seeded price tiers (decision 65). Standard derives from cost; Enterprise and Partner derive from
 * Standard; Pilot is typed in by hand and deliberately leaves some dishes unpriced, so the
 * "missing price" warning and menu hiding can be seen.
 */
export type SeedTier = {
  name: string;
  description: string;
  isDefault?: boolean;
  rule: PriceRule;
  multiplierBp?: number;
  baseTier?: string;
  percentBp?: number;
  /** Typed prices (overrides on derived tiers), dish SKU or option name → cents. */
  dishPrices?: Record<string, number>;
  optionPrices?: Record<string, number>;
};

export const TIER_SEED: SeedTier[] = [
  {
    name: 'Standard',
    description: 'List prices for most companies.',
    isDefault: true,
    rule: 'COST_MULTIPLIER',
    multiplierBp: 24_000,
    // Overrides: a rounder price for the bestseller, and a promo price on lassi.
    dishPrices: { 'PLT-BCH-01': 895, 'DRK-LSI-01': 199 },
  },
  {
    name: 'Enterprise',
    description: 'Volume contracts: 10% below Standard.',
    rule: 'TIER_PERCENT',
    baseTier: 'Standard',
    percentBp: -1_000,
  },
  {
    name: 'Partner',
    description: 'Small partner offices: Standard + 15%.',
    rule: 'TIER_PERCENT',
    baseTier: 'Standard',
    percentBp: 1_500,
  },
  {
    name: 'Pilot programme',
    description: 'Hand-priced trial menu. Dishes without a price here are not offered.',
    rule: 'MANUAL',
    dishPrices: {
      'BWL-PTK-01': 800,
      'BWL-BYO-01': 750,
      'BWL-RJC-01': 600,
      'PLT-CHL-01': 650,
      'PLT-DLM-01': 650,
      'BIR-VEG-01': 700,
      'WRP-PNR-01': 600,
      'SAL-QCP-01': 650,
      'BRK-PHA-01': 350,
      'DRK-LIM-01': 150,
    },
    optionPrices: {
      Paneer: 150,
      Tofu: 100,
      Chickpeas: 50,
      'Chicken tikka': 200,
      'Jeera rice': 0,
      'Brown rice': 50,
      'Basmati rice': 0,
      Roti: 0,
      'Butter naan': 50,
      'Garlic naan': 75,
      Raita: 75,
      'Mint chutney': 25,
      'Kachumber salad': 75,
      Papad: 25,
      Mild: 0,
      Medium: 0,
      Hot: 0,
      'Lemon herb dressing': 0,
      'Yogurt mint dressing': 0,
      'Toasted almonds': 100,
      'Sesame seeds': 25,
      Sweet: 0,
      Salted: 0,
    },
  },
];
