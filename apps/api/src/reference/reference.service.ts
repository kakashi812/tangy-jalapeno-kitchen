import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  REFERENCE_KINDS,
  type ReferenceItem,
  type ReferenceItemUpdate,
  type ReferenceKind,
} from '@fernleaf/shared';
import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

const ITEM_SELECT = { id: true, name: true, isActive: true, sortOrder: true } as const;
const ORDER_BY = [{ sortOrder: 'asc' }, { name: 'asc' }] as const;

/**
 * The part of a Prisma model this service uses. All five reference tables have the same columns,
 * so one service handles them; this interface is what lets it treat them alike.
 */
type ReferenceTable = {
  findMany(args: {
    where?: { isActive?: boolean };
    select: typeof ITEM_SELECT;
    orderBy: typeof ORDER_BY;
  }): Promise<ReferenceItem[]>;
  findFirst(args: {
    where: { name: { equals: string; mode: 'insensitive' }; id?: { not: string } };
  }): Promise<{ id: string } | null>;
  create(args: {
    data: { name: string; isActive: boolean; sortOrder: number };
    select: typeof ITEM_SELECT;
  }): Promise<ReferenceItem>;
  update(args: {
    where: { id: string };
    data: ReferenceItemUpdate;
    select: typeof ITEM_SELECT;
  }): Promise<ReferenceItem>;
  delete(args: { where: { id: string } }): Promise<unknown>;
};

/** "allergen" → "an allergen", "station" → "a station". */
function withArticle(word: string, capitalised = false): string {
  const article = /^[aeiou]/i.test(word) ? 'an' : 'a';
  return `${capitalised ? article[0]!.toUpperCase() + article.slice(1) : article} ${word}`;
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

/** Allergens, dietary tags, kitchen stations, portion sizes and packaging types. */
@Injectable()
export class ReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  private table(kind: ReferenceKind): ReferenceTable {
    const tables = {
      allergens: this.prisma.allergen,
      'dietary-tags': this.prisma.dietaryTag,
      stations: this.prisma.kitchenStation,
      'portion-sizes': this.prisma.portionSize,
      'packaging-types': this.prisma.packagingType,
    } satisfies Record<ReferenceKind, unknown>;
    return tables[kind] as unknown as ReferenceTable;
  }

  list(kind: ReferenceKind, includeInactive: boolean): Promise<ReferenceItem[]> {
    return this.table(kind).findMany({
      where: includeInactive ? {} : { isActive: true },
      select: ITEM_SELECT,
      orderBy: ORDER_BY,
    });
  }

  async create(
    kind: ReferenceKind,
    input: { name: string; isActive: boolean; sortOrder: number },
  ): Promise<ReferenceItem> {
    await this.assertNameFree(kind, input.name);
    return this.table(kind).create({ data: input, select: ITEM_SELECT });
  }

  async update(
    kind: ReferenceKind,
    id: string,
    input: ReferenceItemUpdate,
  ): Promise<ReferenceItem> {
    if (input.name !== undefined) await this.assertNameFree(kind, input.name, id);
    try {
      return await this.table(kind).update({ where: { id }, data: input, select: ITEM_SELECT });
    } catch (error) {
      if (hasPrismaCode(error, 'P2025')) throw ApiException.notFound(this.singular(kind, true));
      throw error;
    }
  }

  /**
   * Deletes an item nothing uses. If dishes, options or companies refer to it, the database's
   * foreign key refuses, and the admin is told to deactivate it instead (decision 54).
   */
  async remove(kind: ReferenceKind, id: string): Promise<void> {
    try {
      await this.table(kind).delete({ where: { id } });
    } catch (error) {
      if (hasPrismaCode(error, 'P2025')) throw ApiException.notFound(this.singular(kind, true));
      if (hasPrismaCode(error, 'P2003')) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          ErrorCode.ReferenceInUse,
          `This ${this.singular(kind)} is in use, so it can't be deleted. Deactivate it instead: it disappears from pickers but past records keep it.`,
        );
      }
      throw error;
    }
  }

  private async assertNameFree(kind: ReferenceKind, name: string, exceptId?: string) {
    const clash = await this.table(kind).findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
    });
    if (clash) {
      throw ApiException.validation({
        name: [`${withArticle(this.singular(kind), true)} with this name already exists`],
      });
    }
  }

  private singular(kind: ReferenceKind, capitalised = false): string {
    const word = REFERENCE_KINDS[kind].singular;
    return capitalised ? word[0]!.toUpperCase() + word.slice(1) : word;
  }
}
