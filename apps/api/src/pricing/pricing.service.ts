import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  createsCycle,
  describeRule,
  pageOffset,
  resolvePrice,
  resolveRulePrice,
  type ItemTierPrice,
  type Paginated,
  type PriceGridQuery,
  type PriceGridRow,
  type PriceItemKind,
  type PricingContext,
  type SetPricesInput,
  type TierRule,
  type TierSummary,
} from '@fernleaf/shared';
import type { z } from 'zod';
import type { TierInputSchema } from '@fernleaf/shared';
import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

type TierBody = z.output<typeof TierInputSchema>;
type TierRow = TierRule & { name: string; description: string; isDefault: boolean };

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

/**
 * Price tiers and prices. Only typed prices are stored; everything else is worked out on read by
 * the shared resolvePrice(), the same function orders use, so the tier editor, menus and orders
 * can never disagree.
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /** All tiers plus every typed price. Small (tiers × items), so loaded whole per request. */
  async loadContext(): Promise<{ context: PricingContext; tiers: TierRow[] }> {
    const [tiers, dishPrices, optionPrices] = await Promise.all([
      this.prisma.priceTier.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
      this.prisma.dishPrice.findMany(),
      this.prisma.optionPrice.findMany(),
    ]);
    const typed = new Map<string, Map<string, number>>();
    for (const row of [
      ...dishPrices.map((p) => ({ tierId: p.tierId, itemId: p.dishId, cents: p.priceCents })),
      ...optionPrices.map((p) => ({ tierId: p.tierId, itemId: p.optionId, cents: p.priceCents })),
    ]) {
      if (!typed.has(row.tierId)) typed.set(row.tierId, new Map());
      typed.get(row.tierId)!.set(row.itemId, row.cents);
    }
    return { context: { tiers: new Map(tiers.map((t) => [t.id, t])), typed }, tiers };
  }

  async listTiers(): Promise<TierSummary[]> {
    const [{ context, tiers }, dishes, companyCounts] = await Promise.all([
      this.loadContext(),
      this.prisma.dish.findMany({
        where: { isActive: true },
        select: { id: true, costCents: true },
      }),
      this.companyCounts(),
    ]);
    const nameOf = (id: string) => tiers.find((t) => t.id === id)?.name ?? 'Unknown tier';
    return tiers.map((tier) => ({
      ...tier,
      ruleLabel: describeRule(tier, nameOf),
      activeDishes: dishes.length,
      missingDishes: dishes.filter((dish) => resolvePrice(tier.id, dish, context) === null).length,
      companyCount: companyCounts.get(tier.id) ?? 0,
    }));
  }

  async getTier(id: string): Promise<TierSummary> {
    const tier = (await this.listTiers()).find((t) => t.id === id);
    if (!tier) throw ApiException.notFound('Price tier');
    return tier;
  }

  async createTier(input: TierBody): Promise<TierSummary> {
    await this.assertNameFree(input.name);
    await this.assertValidBase(null, input);
    const hasDefault = (await this.prisma.priceTier.count({ where: { isDefault: true } })) > 0;
    const tier = await this.prisma.priceTier.create({
      data: { ...input, isDefault: !hasDefault }, // the first tier becomes the default
    });
    return this.getTier(tier.id);
  }

  async updateTier(id: string, input: TierBody): Promise<TierSummary> {
    await this.getTier(id);
    await this.assertNameFree(input.name, id);
    await this.assertValidBase(id, input);
    await this.prisma.priceTier.update({ where: { id }, data: input });
    return this.getTier(id);
  }

  /** Exactly one default: switched in one transaction (a partial unique index also guards it). */
  async makeDefault(id: string): Promise<TierSummary> {
    await this.getTier(id);
    await this.prisma.$transaction([
      this.prisma.priceTier.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
      this.prisma.priceTier.update({ where: { id }, data: { isDefault: true } }),
    ]);
    return this.getTier(id);
  }

  async deleteTier(id: string): Promise<void> {
    const tier = await this.getTier(id);
    const inUse = (message: string) =>
      new ApiException(HttpStatus.CONFLICT, ErrorCode.TierInUse, message);
    if (tier.isDefault)
      throw inUse("The default tier can't be deleted. Make another tier the default first.");
    if (tier.companyCount > 0) {
      throw inUse(
        `${tier.companyCount} compan${tier.companyCount === 1 ? 'y is' : 'ies are'} on this tier. Move them first.`,
      );
    }
    try {
      await this.prisma.priceTier.delete({ where: { id } });
    } catch (error) {
      if (hasPrismaCode(error, 'P2003')) {
        throw inUse('Another tier derives its prices from this one. Change that tier first.');
      }
      throw error;
    }
  }

  /** The tier editor's rows: every dish (or option) with its price here and what the rule gives. */
  async grid(tierId: string, query: PriceGridQuery): Promise<Paginated<PriceGridRow>> {
    await this.getTier(tierId);
    const { context } = await this.loadContext();
    const items = await this.items(query.kind, query.q);
    let rows: PriceGridRow[] = items.map((item) => ({
      ...item,
      price: resolvePrice(tierId, item, context),
      ruleCents: resolveRulePrice(tierId, item, context),
    }));
    if (query.missing === 'true') rows = rows.filter((row) => row.price === null && row.isActive);
    return {
      items: rows.slice(pageOffset(query), pageOffset(query) + query.pageSize),
      total: rows.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Saves typed prices for many items at once; null removes a typed price (back to the rule). */
  async setPrices(tierId: string, input: SetPricesInput): Promise<void> {
    await this.getTier(tierId);
    const ids = input.prices.map((p) => p.itemId);
    const found =
      input.kind === 'dishes'
        ? await this.prisma.dish.findMany({ where: { id: { in: ids } }, select: { id: true } })
        : await this.prisma.option.findMany({ where: { id: { in: ids } }, select: { id: true } });
    const known = new Set(found.map((f) => f.id));
    const fieldErrors: Record<string, string[]> = {};
    input.prices.forEach((price, index) => {
      if (!known.has(price.itemId))
        fieldErrors[`prices.${index}.itemId`] = ['This item no longer exists'];
      // Decision 64: a dish can't be sold for $0; an option (e.g. spice level) can.
      if (input.kind === 'dishes' && price.priceCents === 0) {
        fieldErrors[`prices.${index}.priceCents`] = ['A dish must cost more than $0'];
      }
    });
    if (Object.keys(fieldErrors).length > 0) throw ApiException.validation(fieldErrors);

    await this.prisma.$transaction(
      input.prices.map((price) => {
        if (input.kind === 'dishes') {
          const key = { tierId_dishId: { tierId, dishId: price.itemId } };
          return price.priceCents === null
            ? this.prisma.dishPrice.deleteMany({ where: { tierId, dishId: price.itemId } })
            : this.prisma.dishPrice.upsert({
                where: key,
                create: { tierId, dishId: price.itemId, priceCents: price.priceCents },
                update: { priceCents: price.priceCents },
              });
        }
        const key = { tierId_optionId: { tierId, optionId: price.itemId } };
        return price.priceCents === null
          ? this.prisma.optionPrice.deleteMany({ where: { tierId, optionId: price.itemId } })
          : this.prisma.optionPrice.upsert({
              where: key,
              create: { tierId, optionId: price.itemId, priceCents: price.priceCents },
              update: { priceCents: price.priceCents },
            });
      }),
    );
  }

  /** One dish's (or option's) price on every tier. */
  async itemPrices(kind: PriceItemKind, itemId: string): Promise<ItemTierPrice[]> {
    const item =
      kind === 'dishes'
        ? await this.prisma.dish.findUnique({
            where: { id: itemId },
            select: { id: true, costCents: true },
          })
        : await this.prisma.option.findUnique({
            where: { id: itemId },
            select: { id: true, costCents: true },
          });
    if (!item) throw ApiException.notFound(kind === 'dishes' ? 'Dish' : 'Option');
    const { context, tiers } = await this.loadContext();
    return tiers.map((tier) => ({
      tier: { id: tier.id, name: tier.name, isDefault: tier.isDefault },
      price: resolvePrice(tier.id, item, context),
    }));
  }

  private async items(kind: PriceItemKind, q: string | undefined) {
    if (kind === 'dishes') {
      const dishes = await this.prisma.dish.findMany({
        where: q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { sku: { contains: q.toUpperCase() } },
              ],
            }
          : {},
        select: { id: true, name: true, sku: true, costCents: true, isActive: true },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      });
      return dishes;
    }
    const options = await this.prisma.option.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
      select: { id: true, name: true, costCents: true, isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return options.map((option) => ({ ...option, sku: null }));
  }

  /** Companies per tier. Companies arrive in M5; until then no tier is in use by a company. */
  protected async companyCounts(): Promise<Map<string, number>> {
    return new Map();
  }

  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const clash = await this.prisma.priceTier.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
    });
    if (clash) throw ApiException.validation({ name: ['A tier with this name already exists'] });
  }

  /** A derived tier's base must exist and mustn't lead back to this tier. */
  private async assertValidBase(tierId: string | null, input: TierBody): Promise<void> {
    if (input.rule !== 'TIER_PERCENT' || !input.baseTierId) return;
    const { context } = await this.loadContext();
    if (!context.tiers.has(input.baseTierId)) {
      throw ApiException.validation({ baseTierId: ['That tier no longer exists'] });
    }
    if (tierId && createsCycle(tierId, input.baseTierId, context.tiers)) {
      throw ApiException.validation({
        baseTierId: [
          'That tier is (directly or indirectly) based on this one, which would be a loop',
        ],
      });
    }
  }
}
