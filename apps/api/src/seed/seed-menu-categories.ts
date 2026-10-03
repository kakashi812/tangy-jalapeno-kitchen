import type { PrismaClient } from '../generated/prisma/client.js';
import { CATEGORY_SEED, HIDING_SEED } from './menu-categories-data.js';

/** Creates the seeded categories (with items) when missing, and the seeded company hiding. */
export async function seedMenuCategories(prisma: PrismaClient): Promise<number> {
  const dishes = await prisma.dish.findMany({ select: { id: true, sku: true } });
  const dishId = (sku: string) => {
    const dish = dishes.find((d) => d.sku === sku);
    if (!dish) throw new Error(`Menu seed refers to unknown dish ${sku}`);
    return dish.id;
  };

  for (const [index, seed] of CATEGORY_SEED.entries()) {
    if (await prisma.menuCategory.findUnique({ where: { name: seed.name } })) continue;
    await prisma.menuCategory.create({
      data: {
        name: seed.name,
        sortOrder: index,
        isActive: seed.isActive ?? true,
        isSecret: Boolean(seed.secretCode),
        accessCode: seed.secretCode ?? null,
        items: {
          create: seed.skus.map((sku, order) => ({ dishId: dishId(sku), sortOrder: order })),
        },
      },
    });
  }

  for (const hiding of HIDING_SEED) {
    const company = await prisma.company.findUnique({ where: { name: hiding.company } });
    if (!company) continue;
    for (const name of hiding.categories ?? []) {
      const category = await prisma.menuCategory.findUniqueOrThrow({ where: { name } });
      await prisma.companyHiddenCategory.upsert({
        where: { companyId_categoryId: { companyId: company.id, categoryId: category.id } },
        create: { companyId: company.id, categoryId: category.id },
        update: {},
      });
    }
    for (const { category: name, sku } of hiding.items ?? []) {
      const category = await prisma.menuCategory.findUniqueOrThrow({ where: { name } });
      const item = await prisma.menuItem.findUniqueOrThrow({
        where: { categoryId_dishId: { categoryId: category.id, dishId: dishId(sku) } },
      });
      await prisma.companyHiddenMenuItem.upsert({
        where: { companyId_menuItemId: { companyId: company.id, menuItemId: item.id } },
        create: { companyId: company.id, menuItemId: item.id },
        update: {},
      });
    }
  }
  return CATEGORY_SEED.length;
}
