import { HttpStatus, Injectable } from '@nestjs/common';
import {
  pageOffset,
  type CreateStaffInput,
  type Paginated,
  type StaffListQuery,
  type StaffMember,
  type UpdateStaffInput,
} from '@fernleaf/shared';
import { ApiException } from '../common/api-exception.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashPassword } from '../auth/password.js';
import { checkStaffChange } from './staff.policy.js';

const STAFF_SELECT = {
  id: true,
  email: true,
  name: true,
  isActive: true,
  createdAt: true,
  role: { select: { id: true, name: true, isSystem: true } },
} satisfies Prisma.UserSelect;

type StaffRow = Prisma.UserGetPayload<{ select: typeof STAFF_SELECT }>;

function toStaffMember(row: StaffRow): StaffMember {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: StaffListQuery): Promise<Paginated<StaffMember>> {
    const where: Prisma.UserWhereInput = {
      ...(query.status !== 'all' && { isActive: query.status === 'active' }),
      ...(query.roleId && { roleId: query.roleId }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q.toLowerCase() } },
        ],
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: STAFF_SELECT,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: pageOffset(query),
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows.map(toStaffMember), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<StaffMember> {
    const row = await this.prisma.user.findUnique({ where: { id }, select: STAFF_SELECT });
    if (!row) throw ApiException.notFound('Staff member');
    return toStaffMember(row);
  }

  async create(input: CreateStaffInput): Promise<StaffMember> {
    await this.requireRole(input.roleId);
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw ApiException.validation({ email: ['A staff account with this email already exists'] });
    }
    const row = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        roleId: input.roleId,
        passwordHash: await hashPassword(input.password),
      },
      select: STAFF_SELECT,
    });
    return toStaffMember(row);
  }

  /**
   * Runs in a serializable transaction: if two admins deactivate each other at the same moment,
   * the database lets only one through (the other gets CONCURRENT_UPDATE), so the "last admin"
   * rule can't be dodged by timing.
   */
  async update(actorId: string, id: string, input: UpdateStaffInput): Promise<StaffMember> {
    return this.prisma.$transaction(
      async (tx) => {
        const target = await tx.user.findUnique({ where: { id }, include: { role: true } });
        if (!target) throw ApiException.notFound('Staff member');

        const roleChanges = input.roleId !== undefined && input.roleId !== target.roleId;
        const newRole = roleChanges
          ? await tx.role.findUnique({ where: { id: input.roleId } })
          : null;
        if (roleChanges && !newRole) {
          throw ApiException.validation({ roleId: ['This role no longer exists'] });
        }

        const otherActiveAdmins = await tx.user.count({
          where: { isActive: true, role: { isSystem: true }, id: { not: id } },
        });
        const violation = checkStaffChange({
          actorId,
          target: { id, isActive: target.isActive, roleIsSystem: target.role.isSystem },
          change: { isActive: input.isActive, roleChanges, newRoleIsSystem: newRole?.isSystem },
          otherActiveAdmins,
        });
        if (violation) {
          throw new ApiException(HttpStatus.CONFLICT, violation.code, violation.message);
        }

        const row = await tx.user.update({
          where: { id },
          data: { name: input.name, roleId: input.roleId, isActive: input.isActive },
          select: STAFF_SELECT,
        });
        return toStaffMember(row);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async resetPassword(id: string, password: string): Promise<void> {
    await this.get(id);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(password) },
    });
  }

  private async requireRole(roleId: string): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw ApiException.validation({ roleId: ['This role no longer exists'] });
  }
}
