import type { PrismaClient } from '../generated/prisma/client.js';
import { DISH_PHOTOS } from './dish-photos.js';
import { DISH_SEED, OPTION_SEED } from './menu-data.js';

/**
 * Creates the seeded options and dishes when they don't exist yet (matched by option name and dish
 * SKU). Existing ones are left alone, so admin edits survive a re-seed. A dish without an image
 * gets its seeded photo.
 */
export async function seedMenu(prisma: PrismaClient): Promise<{ options: number; dishes: number }> {
  const [allergens, tags, stations] = await Promise.all([
    prisma.allergen.findMany(),
    prisma.dietaryTag.findMany(),
    prisma.kitchenStation.findMany(),
  ]);
  const idOf = (rows: { id: string; name: string }[], kind: string) => (name: string) => {
    const row = rows.find((r) => r.name === name);
    if (!row) throw new Error(`Seed refers to unknown ${kind} "${name}"`);
    return row.id;
  };
  const allergenId = idOf(allergens, 'allergen');
  const tagId = idOf(tags, 'dietary tag');
  const stationId = idOf(stations, 'station');

  const optionIds = new Map<string, string>();
  for (const option of OPTION_SEED) {
    const saved = await prisma.option.upsert({
      where: { name: option.name },
      update: {},
      create: {
        name: option.name,
        costCents: option.costCents,
        allergens: { create: (option.allergens ?? []).map((n) => ({ allergenId: allergenId(n) })) },
        dietaryTags: { create: (option.tags ?? []).map((n) => ({ dietaryTagId: tagId(n) })) },
      },
    });
    optionIds.set(option.name, saved.id);
  }

  for (const dish of DISH_SEED) {
    const existing = await prisma.dish.findUnique({ where: { sku: dish.sku } });
    const photo = DISH_PHOTOS[dish.sku]?.url ?? null;
    if (existing) {
      if (!existing.imageUrl && photo) {
        await prisma.dish.update({ where: { id: existing.id }, data: { imageUrl: photo } });
      }
      continue;
    }
    const created = await prisma.dish.create({
      data: {
        sku: dish.sku,
        name: dish.name,
        description: dish.description,
        temperature: dish.temperature,
        costCents: dish.costCents,
        stationId: dish.station ? stationId(dish.station) : null,
        minOrderQty: dish.minOrderQty ?? null,
        isActive: dish.isActive ?? true,
        imageUrl: photo,
        allergens: { create: (dish.allergens ?? []).map((n) => ({ allergenId: allergenId(n) })) },
        dietaryTags: { create: (dish.tags ?? []).map((n) => ({ dietaryTagId: tagId(n) })) },
      },
    });
    for (const [groupIndex, group] of (dish.groups ?? []).entries()) {
      await prisma.optionGroup.create({
        data: {
          dishId: created.id,
          name: group.name,
          minSelect: group.min,
          maxSelect: group.max,
          sortOrder: groupIndex,
          items: {
            create: group.options.map((name, optionIndex) => {
              const optionId = optionIds.get(name);
              if (!optionId) throw new Error(`Dish ${dish.sku} refers to unknown option "${name}"`);
              return { optionId, sortOrder: optionIndex };
            }),
          },
        },
      });
    }
  }
  return { options: OPTION_SEED.length, dishes: DISH_SEED.length };
}
