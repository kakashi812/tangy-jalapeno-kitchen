import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ALL_PERMISSIONS,
  ErrorCode,
  isPermission,
  type RoleDetail,
  type RoleInput,
} from '@fernleaf/shared';
import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

type RoleRow = {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
  _count: { users: number };
};

function toRoleDetail(row: RoleRow): RoleDetail {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isSystem: row.isSystem,
    permissions: row.isSystem ? ALL_PERMISSIONS : row.permissions.filter(isPermission),
    staffCount: row._count.users,
  };
}

const WITH_STAFF_COUNT = { _count: { select: { users: true } } } as const;

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<RoleDetail[]> {
    const rows = await this.prisma.role.findMany({
      include: WITH_STAFF_COUNT,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return rows.map(toRoleDetail);
  }

  async get(id: string): Promise<RoleDetail> {
    const row = await this.prisma.role.findUnique({ where: { id }, include: WITH_STAFF_COUNT });
    if (!row) throw ApiException.notFound('Role');
    return toRoleDetail(row);
  }

  async create(input: Required<RoleInput>): Promise<RoleDetail> {
    await this.assertNameFree(input.name);
    const row = await this.prisma.role.create({
      data: { name: input.name, description: input.description, permissions: input.permissions },
      include: WITH_STAFF_COUNT,
    });
    return toRoleDetail(row);
  }

  async update(id: string, input: Required<RoleInput>): Promise<RoleDetail> {
    const role = await this.getEditable(id);
    await this.assertNameFree(input.name, role.id);
    const row = await this.prisma.role.update({
      where: { id },
      data: { name: input.name, description: input.description, permissions: input.permissions },
      include: WITH_STAFF_COUNT,
    });
    return toRoleDetail(row);
  }

  /** Only unused roles can be deleted (the database also refuses, as a backstop). */
  async remove(id: string): Promise<void> {
    const role = await this.getEditable(id);
    if (role.staffCount > 0) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.RoleInUse,
        `${role.staffCount} staff member${role.staffCount === 1 ? ' has' : 's have'} this role. Move them to another role first.`,
      );
    }
    await this.prisma.role.delete({ where: { id } });
  }

  private async getEditable(id: string): Promise<RoleDetail> {
    const role = await this.get(id);
    if (role.isSystem) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.SystemRoleLocked,
        `The ${role.name} role is built in and can't be changed`,
      );
    }
    return role;
  }

  /** Role names are unique ignoring case ("Kitchen" and "kitchen" would confuse everyone). */
  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const clash = await this.prisma.role.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
    });
    if (clash) throw ApiException.validation({ name: ['A role with this name already exists'] });
  }
}
