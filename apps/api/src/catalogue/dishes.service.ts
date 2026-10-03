import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { del, put } from '@vercel/blob';
import { randomUUID } from 'node:crypto';
import {
  DISH_IMAGE_MAX_BYTES,
  DISH_IMAGE_TYPES,
  ErrorCode,
  pageOffset,
  type DishDetail,
  type DishListQuery,
  type DishOptionGroupsInput,
  type DishSummary,
  type Paginated,
} from '@fernleaf/shared';
import type { z } from 'zod';
import type { DishInputSchema } from '@fernleaf/shared';
import { ApiException } from '../common/api-exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REFS_INCLUDE, assertAllFound, flattenRefs } from './catalogue.util.js';

type DishBody = z.output<typeof DishInputSchema>;

const SUMMARY_INCLUDE = {
  station: { select: { id: true, name: true } },
  _count: { select: { optionGroups: true } },
  dietaryTags: REFS_INCLUDE.dietaryTags,
} as const;

const DETAIL_INCLUDE = {
  ...SUMMARY_INCLUDE,
  ...REFS_INCLUDE,
  optionGroups: {
    orderBy: { sortOrder: 'asc' },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
        include: { option: { select: { id: true, name: true, isActive: true } } },
      },
    },
  },
} as const satisfies Prisma.DishInclude;

type SummaryRow = Prisma.DishGetPayload<{ include: typeof SUMMARY_INCLUDE }>;
type DetailRow = Prisma.DishGetPayload<{ include: typeof DETAIL_INCLUDE }>;

function toSummary(row: SummaryRow, canSeeCost: boolean): DishSummary {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    temperature: row.temperature,
    imageUrl: row.imageUrl,
    station: row.station,
    isActive: row.isActive,
    ...(canSeeCost && { costCents: row.costCents }),
    optionGroupCount: row._count.optionGroups,
    dietaryTags: row.dietaryTags
      .map((link) => link.dietaryTag)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ id, name }) => ({ id, name })),
  };
}

function toDetail(row: DetailRow, canSeeCost: boolean): DishDetail {
  return {
    ...toSummary(row, canSeeCost),
    description: row.description,
    minOrderQty: row.minOrderQty,
    ...flattenRefs(row),
    optionGroups: row.optionGroups.map((group) => ({
      id: group.id,
      name: group.name,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      options: group.items.map((item) => item.option),
    })),
  };
}

const EXTENSION: Record<(typeof DISH_IMAGE_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class DishesService {
  private readonly logger = new Logger(DishesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(query: DishListQuery, canSeeCost: boolean): Promise<Paginated<DishSummary>> {
    const where: Prisma.DishWhereInput = {
      ...(query.status !== 'all' && { isActive: query.status === 'active' }),
      ...(query.stationId && { stationId: query.stationId }),
      ...(query.temperature && { temperature: query.temperature }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { sku: { contains: query.q.toUpperCase() } },
        ],
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.dish.findMany({
        where,
        include: SUMMARY_INCLUDE,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: pageOffset(query),
        take: query.pageSize,
      }),
      this.prisma.dish.count({ where }),
    ]);
    return {
      items: rows.map((row) => toSummary(row, canSeeCost)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string, canSeeCost: boolean): Promise<DishDetail> {
    const row = await this.prisma.dish.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!row) throw ApiException.notFound('Dish');
    return toDetail(row, canSeeCost);
  }

  async create(input: DishBody): Promise<DishDetail> {
    await this.assertSkuFree(input.sku);
    await this.assertRefs(input);
    const row = await this.prisma.dish.create({
      data: {
        ...this.scalarFields(input),
        allergens: { create: input.allergenIds.map((allergenId) => ({ allergenId })) },
        dietaryTags: { create: input.dietaryTagIds.map((dietaryTagId) => ({ dietaryTagId })) },
      },
    });
    return this.get(row.id, true);
  }

  async update(id: string, input: DishBody): Promise<DishDetail> {
    const existing = await this.prisma.dish.findUnique({ where: { id }, include: REFS_INCLUDE });
    if (!existing) throw ApiException.notFound('Dish');
    await this.assertSkuFree(input.sku, id);
    await this.assertRefs(input, { ...flattenRefs(existing), stationId: existing.stationId });
    await this.prisma.$transaction([
      this.prisma.dishAllergen.deleteMany({ where: { dishId: id } }),
      this.prisma.dishDietaryTag.deleteMany({ where: { dishId: id } }),
      this.prisma.dish.update({
        where: { id },
        data: {
          ...this.scalarFields(input),
          allergens: { create: input.allergenIds.map((allergenId) => ({ allergenId })) },
          dietaryTags: { create: input.dietaryTagIds.map((dietaryTagId) => ({ dietaryTagId })) },
        },
      }),
    ]);
    return this.get(id, true);
  }

  /**
   * Replaces all of a dish's option groups in one transaction (they are edited together on one
   * screen). Past orders are unaffected: they keep a snapshot of what was chosen.
   */
  async setOptionGroups(id: string, input: DishOptionGroupsInput): Promise<DishDetail> {
    const current = await this.get(id, true);
    const allIds = [...new Set(input.groups.flatMap((g) => g.optionIds))];
    const options = await this.prisma.option.findMany({ where: { id: { in: allIds } } });
    const alreadyOffered = new Set(current.optionGroups.flatMap((g) => g.options.map((o) => o.id)));
    input.groups.forEach((group, index) =>
      assertAllFound(
        `groups.${index}.optionIds`,
        group.optionIds,
        options,
        'options',
        alreadyOffered,
      ),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.optionGroup.deleteMany({ where: { dishId: id } });
      for (const [groupIndex, group] of input.groups.entries()) {
        await tx.optionGroup.create({
          data: {
            dishId: id,
            name: group.name,
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            sortOrder: groupIndex,
            items: {
              create: group.optionIds.map((optionId, optionIndex) => ({
                optionId,
                sortOrder: optionIndex,
              })),
            },
          },
        });
      }
    });
    return this.get(id, true);
  }

  /** Stores the image in Vercel Blob and points the dish at it; the old image is removed. */
  async setImage(id: string, file: Express.Multer.File | undefined): Promise<DishDetail> {
    if (!file) throw ApiException.validation({ image: ['Choose an image to upload'] });
    const type = file.mimetype as (typeof DISH_IMAGE_TYPES)[number];
    if (!DISH_IMAGE_TYPES.includes(type)) {
      throw ApiException.validation({ image: ['Use a JPEG, PNG or WebP image'] });
    }
    if (file.size > DISH_IMAGE_MAX_BYTES) {
      throw ApiException.validation({ image: ['The image must be 2 MB or smaller'] });
    }
    const dish = await this.prisma.dish.findUnique({ where: { id }, select: { imageUrl: true } });
    if (!dish) throw ApiException.notFound('Dish');
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCode.Internal,
        'Image storage is not configured on this server',
      );
    }

    const blob = await put(`dishes/${id}-${randomUUID()}.${EXTENSION[type]}`, file.buffer, {
      access: 'public',
      contentType: type,
    });
    await this.prisma.dish.update({ where: { id }, data: { imageUrl: blob.url } });
    if (dish.imageUrl) await this.deleteBlobQuietly(dish.imageUrl);
    return this.get(id, true);
  }

  /** A leftover file only costs storage, so a failed delete is logged, not shown to the user. */
  private async deleteBlobQuietly(url: string): Promise<void> {
    if (!url.includes('.blob.vercel-storage.com/')) return; // seed images hosted elsewhere
    try {
      await del(url);
    } catch (error) {
      this.logger.warn(`Could not delete old image ${url}: ${String(error)}`);
    }
  }

  private scalarFields(input: DishBody) {
    return {
      name: input.name,
      description: input.description,
      sku: input.sku,
      temperature: input.temperature,
      costCents: input.costCents,
      stationId: input.stationId,
      minOrderQty: input.minOrderQty,
      isActive: input.isActive,
    };
  }

  private async assertSkuFree(sku: string, exceptId?: string): Promise<void> {
    const clash = await this.prisma.dish.findFirst({
      where: { sku, ...(exceptId && { id: { not: exceptId } }) },
      select: { name: true },
    });
    if (clash) throw ApiException.validation({ sku: [`Already used by "${clash.name}"`] });
  }

  private async assertRefs(
    input: DishBody,
    current?: {
      allergens: { id: string }[];
      dietaryTags: { id: string }[];
      stationId: string | null;
    },
  ): Promise<void> {
    const [allergens, tags, station] = await Promise.all([
      this.prisma.allergen.findMany({ where: { id: { in: input.allergenIds } } }),
      this.prisma.dietaryTag.findMany({ where: { id: { in: input.dietaryTagIds } } }),
      input.stationId
        ? this.prisma.kitchenStation.findUnique({ where: { id: input.stationId } })
        : Promise.resolve(null),
    ]);
    assertAllFound(
      'allergenIds',
      input.allergenIds,
      allergens,
      'allergens',
      new Set(current?.allergens.map((a) => a.id)),
    );
    assertAllFound(
      'dietaryTagIds',
      input.dietaryTagIds,
      tags,
      'dietary tags',
      new Set(current?.dietaryTags.map((t) => t.id)),
    );
    if (input.stationId) {
      assertAllFound(
        'stationId',
        [input.stationId],
        station ? [station] : [],
        'stations',
        new Set(current?.stationId ? [current.stationId] : []),
      );
    }
  }
}
