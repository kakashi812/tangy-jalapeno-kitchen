import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  pageOffset,
  type OptionDetail,
  type OptionInput,
  type OptionListQuery,
  type OptionSummary,
  type Paginated,
} from '@fernleaf/shared';
import { ApiException } from '../common/api-exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  REFS_INCLUDE,
  assertAllFound,
  flattenRefs,
  hasPrismaCode,
  type JoinedRefs,
} from './catalogue.util.js';

type OptionRow = JoinedRefs & { id: string; name: string; costCents: number; isActive: boolean };

function toSummary(row: OptionRow, canSeeCost: boolean): OptionSummary {
  return {
    id: row.id,
    name: row.name,
    ...(canSeeCost && { costCents: row.costCents }),
    isActive: row.isActive,
    ...flattenRefs(row),
  };
}

@Injectable()
export class OptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: OptionListQuery, canSeeCost: boolean): Promise<Paginated<OptionSummary>> {
    const where: Prisma.OptionWhereInput = {
      ...(query.status !== 'all' && { isActive: query.status === 'active' }),
      ...(query.q && { name: { contains: query.q, mode: 'insensitive' } }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.option.findMany({
        where,
        include: REFS_INCLUDE,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: pageOffset(query),
        take: query.pageSize,
      }),
      this.prisma.option.count({ where }),
    ]);
    return {
      items: rows.map((row) => toSummary(row, canSeeCost)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string, canSeeCost: boolean): Promise<OptionDetail> {
    const row = await this.prisma.option.findUnique({
      where: { id },
      include: {
        ...REFS_INCLUDE,
        groupItems: {
          select: { group: { select: { dish: { select: { id: true, name: true, sku: true } } } } },
        },
      },
    });
    if (!row) throw ApiException.notFound('Option');
    const usedBy = [
      ...new Map(row.groupItems.map((item) => [item.group.dish.id, item.group.dish])).values(),
    ];
    return {
      ...toSummary(row, canSeeCost),
      usedBy: usedBy.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async create(input: OptionInput): Promise<OptionDetail> {
    await this.assertNameFree(input.name);
    await this.assertRefs(input);
    const row = await this.prisma.option.create({
      data: {
        name: input.name,
        costCents: input.costCents,
        isActive: input.isActive,
        allergens: { create: input.allergenIds.map((allergenId) => ({ allergenId })) },
        dietaryTags: { create: input.dietaryTagIds.map((dietaryTagId) => ({ dietaryTagId })) },
      },
    });
    return this.get(row.id, true);
  }

  async update(id: string, input: OptionInput): Promise<OptionDetail> {
    const existing = await this.prisma.option.findUnique({ where: { id }, include: REFS_INCLUDE });
    if (!existing) throw ApiException.notFound('Option');
    await this.assertNameFree(input.name, id);
    await this.assertRefs(input, flattenRefs(existing));
    // Replace the allergen and tag links in the same transaction as the update.
    await this.prisma.$transaction([
      this.prisma.optionAllergen.deleteMany({ where: { optionId: id } }),
      this.prisma.optionDietaryTag.deleteMany({ where: { optionId: id } }),
      this.prisma.option.update({
        where: { id },
        data: {
          name: input.name,
          costCents: input.costCents,
          isActive: input.isActive,
          allergens: { create: input.allergenIds.map((allergenId) => ({ allergenId })) },
          dietaryTags: { create: input.dietaryTagIds.map((dietaryTagId) => ({ dietaryTagId })) },
        },
      }),
    ]);
    return this.get(id, true);
  }

  /** Only options no dish offers can be deleted; others are deactivated (the FK refuses). */
  async remove(id: string): Promise<void> {
    try {
      await this.prisma.option.delete({ where: { id } });
    } catch (error) {
      if (hasPrismaCode(error, 'P2025')) throw ApiException.notFound('Option');
      if (hasPrismaCode(error, 'P2003')) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          ErrorCode.OptionInUse,
          "This option is offered by a dish, so it can't be deleted. Deactivate it instead, or remove it from those dishes first.",
        );
      }
      throw error;
    }
  }

  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const clash = await this.prisma.option.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
    });
    if (clash) throw ApiException.validation({ name: ['An option with this name already exists'] });
  }

  private async assertRefs(
    input: OptionInput,
    current?: { allergens: { id: string }[]; dietaryTags: { id: string }[] },
  ): Promise<void> {
    const [allergens, tags] = await Promise.all([
      this.prisma.allergen.findMany({ where: { id: { in: input.allergenIds } } }),
      this.prisma.dietaryTag.findMany({ where: { id: { in: input.dietaryTagIds } } }),
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
  }
}
