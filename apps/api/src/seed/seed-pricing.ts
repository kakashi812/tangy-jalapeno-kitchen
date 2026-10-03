import type { PrismaClient } from '../generated/prisma/client.js';
import { TIER_SEED } from './pricing-data.js';

/** Creates the seeded tiers (and their typed prices) when a tier of that name doesn't exist yet. */
export async function seedPricing(prisma: PrismaClient): Promise<number> {
  const [dishes, options] = await Promise.all([
    prisma.dish.findMany({ select: { id: true, sku: true } }),
    prisma.option.findMany({ select: { id: true, name: true } }),
  ]);
  const dishId = (sku: string) => {
    const dish = dishes.find((d) => d.sku === sku);
    if (!dish) throw new Error(`Pricing seed refers to unknown dish ${sku}`);
    return dish.id;
  };
  const optionId = (name: string) => {
    const option = options.find((o) => o.name === name);
    if (!option) throw new Error(`Pricing seed refers to unknown option ${name}`);
    return option.id;
  };

  for (const seed of TIER_SEED) {
    if (await prisma.priceTier.findUnique({ where: { name: seed.name } })) continue;
    const base = seed.baseTier
      ? await prisma.priceTier.findUniqueOrThrow({ where: { name: seed.baseTier } })
      : null;
    const hasDefault = (await prisma.priceTier.count({ where: { isDefault: true } })) > 0;
    await prisma.priceTier.create({
      data: {
        name: seed.name,
        description: seed.description,
        isDefault: Boolean(seed.isDefault) && !hasDefault,
        rule: seed.rule,
        multiplierBp: seed.multiplierBp ?? null,
        baseTierId: base?.id ?? null,
        percentBp: seed.percentBp ?? null,
        dishPrices: {
          create: Object.entries(seed.dishPrices ?? {}).map(([sku, priceCents]) => ({
            dishId: dishId(sku),
            priceCents,
          })),
        },
        optionPrices: {
          create: Object.entries(seed.optionPrices ?? {}).map(([name, priceCents]) => ({
            optionId: optionId(name),
            priceCents,
          })),
        },
      },
    });
  }
  return TIER_SEED.length;
}
