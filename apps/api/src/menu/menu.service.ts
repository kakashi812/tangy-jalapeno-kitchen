import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  buildMenu,
  type AdminMenuCategory,
  type CategoryInputSchema,
  type CategoryItemsInput,
  type EmployeeMenu,
  type MenuHiding,
  type MenuSourceCategory,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { ApiException } from '../common/api-exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PricingService } from '../pricing/pricing.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

type CategoryBody = z.output<typeof CategoryInputSchema>;

const REFS = {
  allergens: { include: { allergen: { select: { id: true, name: true, sortOrder: true } } } },
  dietaryTags: { include: { dietaryTag: { select: { id: true, name: true, sortOrder: true } } } },
} as const;

/** Everything the menu builder needs about each dish, loaded in one query. */
const SOURCE_INCLUDE = {
  items: {
    orderBy: { sortOrder: 'asc' },
    include: {
      dish: {
        include: {
          ...REFS,
          optionGroups: {
            orderBy: { sortOrder: 'asc' },
            include: {
              items: { orderBy: { sortOrder: 'asc' }, include: { option: { include: REFS } } },
            },
          },
        },
      },
    },
  },
} as const satisfies Prisma.MenuCategoryInclude;

type SourceRow = Prisma.MenuCategoryGetPayload<{ include: typeof SOURCE_INCLUDE }>;
type RefLinks = {
  allergens: { allergen: { id: string; name: string; sortOrder: number } }[];
  dietaryTags: { dietaryTag: { id: string; name: string; sortOrder: number } }[];
};

const refs = (row: RefLinks) => ({
  allergens: row.allergens
    .map((l) => l.allergen)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ id, name }) => ({ id, name })),
  dietaryTags: row.dietaryTags
    .map((l) => l.dietaryTag)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ id, name }) => ({ id, name })),
});

function toSource(row: SourceRow): MenuSourceCategory {
  return {
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    isSecret: row.isSecret,
    accessCode: row.accessCode,
    items: row.items.map((item) => ({
      id: item.id,
      isActive: item.isActive,
      dish: {
        id: item.dish.id,
        name: item.dish.name,
        description: item.dish.description,
        sku: item.dish.sku,
        imageUrl: item.dish.imageUrl,
        temperature: item.dish.temperature,
        isActive: item.dish.isActive,
        costCents: item.dish.costCents,
        minOrderQty: item.dish.minOrderQty,
        ...refs(item.dish),
        groups: item.dish.optionGroups.map((group) => ({
          id: group.id,
          name: group.name,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          options: group.items.map(({ option }) => ({
            id: option.id,
            name: option.name,
            isActive: option.isActive,
            costCents: option.costCents,
            ...refs(option),
          })),
        })),
      },
    })),
  };
}

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  /**
   * The menu exactly as one employee sees it: their company's hiding and price tier, their
   * allergies and diet (warnings only), plus a secret category if `code` matches one. Orders (M8)
   * validate against this same function, so the preview and what can be ordered never differ.
   */
  async forEmployee(
    employeeId: string,
    code?: string | string[],
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<EmployeeMenu> {
    const employee = await client.employee.findUnique({
      where: { id: employeeId },
      include: {
        allergies: { include: { allergen: { select: { id: true, name: true } } } },
        dietaryPreferences: { include: { dietaryTag: { select: { id: true, name: true } } } },
        company: {
          include: {
            hiddenCategories: { select: { categoryId: true } },
            hiddenMenuItems: { select: { menuItemId: true } },
          },
        },
      },
    });
    if (!employee) throw ApiException.notFound('Employee');

    const [{ context, tiers }, categories] = await Promise.all([
      this.pricing.loadContext(client),
      client.menuCategory.findMany({ include: SOURCE_INCLUDE, orderBy: { sortOrder: 'asc' } }),
    ]);
    const tier =
      tiers.find((t) => t.id === employee.company.priceTierId) ?? tiers.find((t) => t.isDefault);
    if (!tier)
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.Conflict,
        'No default price tier is set',
      );

    const unlocked = new Set<string>();
    const codes = (Array.isArray(code) ? code : [code])
      .filter((c): c is string => Boolean(c?.trim()))
      .map((c) => c.trim().toUpperCase());
    for (const c of codes) unlocked.add(c);

    const menu = buildMenu(
      categories.map(toSource),
      {
        tierId: tier.id,
        hiddenCategoryIds: new Set(employee.company.hiddenCategories.map((h) => h.categoryId)),
        hiddenItemIds: new Set(employee.company.hiddenMenuItems.map((h) => h.menuItemId)),
        allergyIds: new Set(employee.allergies.map((a) => a.allergen.id)),
        dietIds: new Set(employee.dietaryPreferences.map((d) => d.dietaryTag.id)),
      },
      context,
      unlocked,
    );

    // A code was given: it must open a secret category this employee can see (decision 21).
    const unlockedCategories = categories.filter(
      (c) =>
        c.isSecret && c.accessCode && unlocked.has(c.accessCode) && menu.some((m) => m.id === c.id),
    );
    const unlockedCategory = unlockedCategories.map((c) => c.name).join(', ') || null;
    if (codes.some((code) => !unlockedCategories.some((c) => c.accessCode === code))) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        ErrorCode.SecretNotFound,
        'No secret category matches that code for this employee',
      );
    }

    return {
      employee: {
        id: employee.id,
        name: employee.name,
        allergies: employee.allergies.map((a) => a.allergen),
        dietaryPreferences: employee.dietaryPreferences.map((d) => d.dietaryTag),
      },
      company: { id: employee.company.id, name: employee.company.name },
      tier: { id: tier.id, name: tier.name },
      categories: menu,
      unlockedCategory,
    };
  }

  // ─── Admin: categories and items ──────────────────────────────────────────────────────────

  async listCategories(): Promise<AdminMenuCategory[]> {
    const rows = await this.prisma.menuCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            dish: { select: { id: true, name: true, sku: true, isActive: true, imageUrl: true } },
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      isActive: row.isActive,
      isSecret: row.isSecret,
      accessCode: row.accessCode,
      items: row.items.map((item) => ({ id: item.id, isActive: item.isActive, dish: item.dish })),
    }));
  }

  async getCategory(id: string): Promise<AdminMenuCategory> {
    const category = (await this.listCategories()).find((c) => c.id === id);
    if (!category) throw ApiException.notFound('Category');
    return category;
  }

  async createCategory(input: CategoryBody): Promise<AdminMenuCategory> {
    await this.assertUnique(input);
    const last = await this.prisma.menuCategory.aggregate({ _max: { sortOrder: true } });
    const row = await this.prisma.menuCategory.create({
      data: { ...input, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    return this.getCategory(row.id);
  }

  async updateCategory(id: string, input: CategoryBody): Promise<AdminMenuCategory> {
    await this.getCategory(id);
    await this.assertUnique(input, id);
    await this.prisma.menuCategory.update({ where: { id }, data: input });
    return this.getCategory(id);
  }

  /** Deleting a category only removes it from the menu: dishes and past orders are untouched. */
  async deleteCategory(id: string): Promise<void> {
    await this.getCategory(id);
    await this.prisma.menuCategory.delete({ where: { id } });
  }

  async reorderCategories(ids: string[]): Promise<AdminMenuCategory[]> {
    const existing = await this.prisma.menuCategory.findMany({ select: { id: true } });
    if (existing.length !== ids.length || !existing.every((c) => ids.includes(c.id))) {
      throw ApiException.validation({ ids: ['Send every category exactly once'] });
    }
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.menuCategory.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    return this.listCategories();
  }

  /**
   * Sets a category's dishes in display order. Items are kept by dish (so a company's hiding of an
   * item survives reordering); dishes no longer listed are removed from the category.
   */
  async setItems(categoryId: string, input: CategoryItemsInput): Promise<AdminMenuCategory> {
    await this.getCategory(categoryId);
    const dishIds = input.items.map((i) => i.dishId);
    const dishes = await this.prisma.dish.findMany({
      where: { id: { in: dishIds } },
      select: { id: true },
    });
    if (dishes.length !== new Set(dishIds).size)
      throw ApiException.validation({ items: ['Some dishes no longer exist. Reload the page.'] });
    await this.prisma.$transaction([
      this.prisma.menuItem.deleteMany({ where: { categoryId, dishId: { notIn: dishIds } } }),
      ...input.items.map((item, index) =>
        this.prisma.menuItem.upsert({
          where: { categoryId_dishId: { categoryId, dishId: item.dishId } },
          create: { categoryId, dishId: item.dishId, sortOrder: index, isActive: item.isActive },
          update: { sortOrder: index, isActive: item.isActive },
        }),
      ),
    ]);
    return this.getCategory(categoryId);
  }

  // ─── Company hiding ───────────────────────────────────────────────────────────────────────

  async getHiding(companyId: string): Promise<MenuHiding> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { hiddenCategories: true, hiddenMenuItems: true },
    });
    if (!company) throw ApiException.notFound('Company');
    return {
      hiddenCategoryIds: company.hiddenCategories.map((h) => h.categoryId),
      hiddenItemIds: company.hiddenMenuItems.map((h) => h.menuItemId),
    };
  }

  async setHiding(companyId: string, input: MenuHiding): Promise<MenuHiding> {
    await this.getHiding(companyId);
    await this.prisma.$transaction([
      this.prisma.companyHiddenCategory.deleteMany({ where: { companyId } }),
      this.prisma.companyHiddenMenuItem.deleteMany({ where: { companyId } }),
      this.prisma.companyHiddenCategory.createMany({
        data: [...new Set(input.hiddenCategoryIds)].map((categoryId) => ({
          companyId,
          categoryId,
        })),
      }),
      this.prisma.companyHiddenMenuItem.createMany({
        data: [...new Set(input.hiddenItemIds)].map((menuItemId) => ({ companyId, menuItemId })),
      }),
    ]);
    return this.getHiding(companyId);
  }

  private async assertUnique(input: CategoryBody, exceptId?: string) {
    const not = exceptId ? { id: { not: exceptId } } : {};
    const [nameClash, codeClash] = await Promise.all([
      this.prisma.menuCategory.findFirst({
        where: { name: { equals: input.name, mode: 'insensitive' }, ...not },
      }),
      input.accessCode
        ? this.prisma.menuCategory.findFirst({ where: { accessCode: input.accessCode, ...not } })
        : null,
    ]);
    const errors: Record<string, string[]> = {};
    if (nameClash) errors.name = ['A category with this name already exists'];
    if (codeClash) errors.accessCode = [`"${codeClash.name}" already uses this code`];
    if (Object.keys(errors).length > 0) throw ApiException.validation(errors);
  }
}
