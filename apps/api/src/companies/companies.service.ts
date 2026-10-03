import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  formatTimeOfDay,
  pageOffset,
  type AddressInputSchema,
  type CompanyAddress,
  type CompanyDetail,
  type CompanyHoliday,
  type CompanyHolidayInput,
  type CompanyInputSchema,
  type CompanyListQuery,
  type CompanySummary,
  type DriverOption,
  type Paginated,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { ApiException } from '../common/api-exception.js';
import { fromDbDate, toDbDate } from '../common/db-dates.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';

type CompanyBody = z.output<typeof CompanyInputSchema>;
type AddressBody = z.output<typeof AddressInputSchema>;

const SUMMARY_INCLUDE = {
  domains: { select: { domain: true }, orderBy: { domain: 'asc' } },
  priceTier: { select: { id: true, name: true } },
  _count: { select: { addresses: true } },
} as const satisfies Prisma.CompanyInclude;

const DETAIL_INCLUDE = {
  ...SUMMARY_INCLUDE,
  defaultPackagingType: { select: { id: true, name: true, isActive: true } },
  defaultDriver: { select: { id: true, name: true, isActive: true } },
  addresses: { orderBy: [{ isDefault: 'desc' }, { label: 'asc' }] },
  holidays: { orderBy: { startDate: 'asc' } },
} as const satisfies Prisma.CompanyInclude;

type SummaryRow = Prisma.CompanyGetPayload<{ include: typeof SUMMARY_INCLUDE }>;
type DetailRow = Prisma.CompanyGetPayload<{ include: typeof DETAIL_INCLUDE }>;

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function toAddress(row: DetailRow['addresses'][number]): CompanyAddress {
  return {
    id: row.id,
    label: row.label,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    postcode: row.postcode,
    deliveryNotes: row.deliveryNotes,
    isDefault: row.isDefault,
  };
}

function toHoliday(row: DetailRow['holidays'][number]): CompanyHoliday {
  return {
    id: row.id,
    name: row.name,
    startDate: fromDbDate(row.startDate),
    endDate: fromDbDate(row.endDate),
  };
}

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** The tier a company is on; companies without one use the default tier (brief 4.3.4). */
  private async defaultTier() {
    return this.prisma.priceTier.findFirst({
      where: { isDefault: true },
      select: { id: true, name: true },
    });
  }

  private tierOf(
    row: SummaryRow,
    fallback: { id: string; name: string } | null,
  ): CompanySummary['priceTier'] {
    if (row.priceTier) return { ...row.priceTier, viaDefault: false };
    return fallback ? { ...fallback, viaDefault: true } : null;
  }

  async list(query: CompanyListQuery): Promise<Paginated<CompanySummary>> {
    const where: Prisma.CompanyWhereInput = {
      ...(query.status !== 'all' && { isActive: query.status === 'active' }),
      ...(query.priceTierId && { priceTierId: query.priceTierId }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { domains: { some: { domain: { contains: query.q.toLowerCase() } } } },
        ],
      }),
    };
    const [rows, total, fallback] = await Promise.all([
      this.prisma.company.findMany({
        where,
        include: SUMMARY_INCLUDE,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: pageOffset(query),
        take: query.pageSize,
      }),
      this.prisma.company.count({ where }),
      this.defaultTier(),
    ]);
    const employeeCounts = await this.employeeCounts();
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        isActive: row.isActive,
        domains: row.domains.map((d) => d.domain),
        priceTier: this.tierOf(row, fallback),
        addressCount: row._count.addresses,
        employeeCount: employeeCounts.get(row.id) ?? 0,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string): Promise<CompanyDetail> {
    const [row, fallback] = await Promise.all([
      this.prisma.company.findUnique({ where: { id }, include: DETAIL_INCLUDE }),
      this.defaultTier(),
    ]);
    if (!row) throw ApiException.notFound('Company');
    const employeeCounts = await this.employeeCounts();
    return {
      id: row.id,
      name: row.name,
      isActive: row.isActive,
      domains: row.domains.map((d) => d.domain),
      priceTierId: row.priceTierId,
      priceTier: this.tierOf(row, fallback),
      addressCount: row._count.addresses,
      employeeCount: employeeCounts.get(id) ?? 0,
      billingContactName: row.billingContactName,
      billingEmail: row.billingEmail,
      billingPhone: row.billingPhone,
      workingDays: [...row.workingDays].sort((a, b) => a - b),
      defaultDeliveryTimeMinutes: row.defaultDeliveryTimeMinutes,
      dispatchLeadMinutes: row.dispatchLeadMinutes,
      defaultPackagingType: row.defaultPackagingType,
      driverInstructions: row.driverInstructions,
      defaultDriver: row.defaultDriver,
      owner: await this.owner(),
      addresses: row.addresses.map(toAddress),
      holidays: row.holidays.map(toHoliday),
    };
  }

  async create(input: CompanyBody): Promise<CompanyDetail> {
    await this.validate(input);
    const row = await this.prisma.company.create({
      data: {
        ...this.scalars(input),
        domains: { create: input.domains.map((domain) => ({ domain })) },
      },
    });
    return this.get(row.id);
  }

  async update(id: string, input: CompanyBody): Promise<CompanyDetail> {
    const existing = await this.prisma.company.findUnique({
      where: { id },
      select: { defaultDriverId: true, defaultPackagingTypeId: true },
    });
    if (!existing) throw ApiException.notFound('Company');
    await this.validate(input, id, existing);
    // Domains are replaced as a set, in the same transaction as the other fields.
    await this.prisma.$transaction([
      this.prisma.companyDomain.deleteMany({ where: { companyId: id } }),
      this.prisma.company.update({
        where: { id },
        data: {
          ...this.scalars(input),
          domains: { create: input.domains.map((domain) => ({ domain })) },
        },
      }),
    ]);
    return this.get(id);
  }

  // ─── Addresses ────────────────────────────────────────────────────────────────────────────

  async addAddress(companyId: string, input: AddressBody): Promise<CompanyDetail> {
    await this.requireCompany(companyId);
    const count = await this.prisma.companyAddress.count({ where: { companyId } });
    const isDefault = input.isDefault || count === 0; // the first address is the default
    await this.prisma.$transaction([
      ...(isDefault ? [this.clearDefault(companyId)] : []),
      this.prisma.companyAddress.create({ data: { ...input, companyId, isDefault } }),
    ]);
    return this.get(companyId);
  }

  async updateAddress(
    companyId: string,
    addressId: string,
    input: AddressBody,
  ): Promise<CompanyDetail> {
    const address = await this.requireAddress(companyId, addressId);
    if (address.isDefault && !input.isDefault) {
      throw ApiException.validation({ isDefault: ['Make another address the default instead'] });
    }
    await this.prisma.$transaction([
      ...(input.isDefault && !address.isDefault ? [this.clearDefault(companyId)] : []),
      this.prisma.companyAddress.update({ where: { id: addressId }, data: input }),
    ]);
    return this.get(companyId);
  }

  /** Addresses used by orders can't be deleted (the orders' foreign keys refuse, from M8). */
  async deleteAddress(companyId: string, addressId: string): Promise<CompanyDetail> {
    const address = await this.requireAddress(companyId, addressId);
    if (address.isDefault) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.AddressInUse,
        'This is the default address. Make another address the default first.',
      );
    }
    try {
      await this.prisma.companyAddress.delete({ where: { id: addressId } });
    } catch (error) {
      if (hasPrismaCode(error, 'P2003')) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          ErrorCode.AddressInUse,
          'Orders were delivered to this address, so it can’t be deleted.',
        );
      }
      throw error;
    }
    return this.get(companyId);
  }

  // ─── Holidays ─────────────────────────────────────────────────────────────────────────────

  async addHoliday(companyId: string, input: CompanyHolidayInput): Promise<CompanyDetail> {
    await this.requireCompany(companyId);
    await this.assertNoHolidayOverlap(companyId, input);
    await this.prisma.companyHoliday.create({
      data: {
        companyId,
        name: input.name,
        startDate: toDbDate(input.startDate),
        endDate: toDbDate(input.endDate),
      },
    });
    return this.get(companyId);
  }

  async deleteHoliday(companyId: string, holidayId: string): Promise<CompanyDetail> {
    const { count } = await this.prisma.companyHoliday.deleteMany({
      where: { id: holidayId, companyId },
    });
    if (count === 0) throw ApiException.notFound('Holiday');
    return this.get(companyId);
  }

  // ─── Drivers ──────────────────────────────────────────────────────────────────────────────

  /** Active staff who can be given deliveries: their role grants deliveries.own (admins excluded). */
  async drivers(): Promise<DriverOption[]> {
    return this.prisma.user.findMany({
      where: { isActive: true, role: { isSystem: false, permissions: { has: 'deliveries.own' } } },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────────────────

  private scalars(input: CompanyBody) {
    return {
      name: input.name,
      isActive: input.isActive,
      priceTierId: input.priceTierId,
      billingContactName: input.billingContactName,
      billingEmail: input.billingEmail.toLowerCase(),
      billingPhone: input.billingPhone,
      workingDays: [...input.workingDays].sort((a, b) => a - b),
      defaultDeliveryTimeMinutes: input.defaultDeliveryTimeMinutes,
      dispatchLeadMinutes: input.dispatchLeadMinutes,
      defaultPackagingTypeId: input.defaultPackagingTypeId,
      driverInstructions: input.driverInstructions,
      defaultDriverId: input.defaultDriverId,
    };
  }

  /** Every rule the database can't express on its own, reported on the form's fields. */
  private async validate(
    input: CompanyBody,
    companyId?: string,
    current?: { defaultDriverId: string | null; defaultPackagingTypeId: string },
  ): Promise<void> {
    const [nameClash, domainClashes, tier, packaging, settings, drivers] = await Promise.all([
      this.prisma.company.findFirst({
        where: {
          name: { equals: input.name, mode: 'insensitive' },
          ...(companyId && { id: { not: companyId } }),
        },
      }),
      this.prisma.companyDomain.findMany({
        where: {
          domain: { in: input.domains },
          ...(companyId && { companyId: { not: companyId } }),
        },
        include: { company: { select: { name: true } } },
      }),
      input.priceTierId
        ? this.prisma.priceTier.findUnique({ where: { id: input.priceTierId } })
        : null,
      this.prisma.packagingType.findUnique({ where: { id: input.defaultPackagingTypeId } }),
      this.settings.get(),
      this.drivers(),
    ]);
    const errors: Record<string, string[]> = {};
    if (nameClash) errors.name = ['A company with this name already exists'];
    for (const clash of domainClashes) {
      const index = input.domains.indexOf(clash.domain);
      errors[`domains.${index}`] = [`${clash.domain} already belongs to ${clash.company.name}`];
    }
    if (input.priceTierId && !tier) errors.priceTierId = ['That price tier no longer exists'];
    if (!packaging) errors.defaultPackagingTypeId = ['That packaging type no longer exists'];
    else if (!packaging.isActive && packaging.id !== current?.defaultPackagingTypeId) {
      errors.defaultPackagingTypeId = ['That packaging type is inactive'];
    }
    const { deliveryWindowStartMinutes: from, deliveryWindowEndMinutes: to } = settings;
    if (input.defaultDeliveryTimeMinutes < from || input.defaultDeliveryTimeMinutes > to) {
      errors.defaultDeliveryTimeMinutes = [
        `Deliveries run between ${formatTimeOfDay(from)} and ${formatTimeOfDay(to)}`,
      ];
    }
    // A deactivated default driver may stay (decision 30), but a new one must be an active driver.
    if (
      input.defaultDriverId &&
      input.defaultDriverId !== current?.defaultDriverId &&
      !drivers.some((d) => d.id === input.defaultDriverId)
    ) {
      errors.defaultDriverId = ['Choose an active driver'];
    }
    if (Object.keys(errors).length > 0) throw ApiException.validation(errors);
  }

  private clearDefault(companyId: string) {
    return this.prisma.companyAddress.updateMany({
      where: { companyId, isDefault: true },
      data: { isDefault: false },
    });
  }

  private async requireCompany(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id }, select: { id: true } });
    if (!company) throw ApiException.notFound('Company');
  }

  private async requireAddress(companyId: string, addressId: string) {
    const address = await this.prisma.companyAddress.findFirst({
      where: { id: addressId, companyId },
    });
    if (!address) throw ApiException.notFound('Address');
    return address;
  }

  private async assertNoHolidayOverlap(companyId: string, input: CompanyHolidayInput) {
    const clash = await this.prisma.companyHoliday.findFirst({
      where: {
        companyId,
        startDate: { lte: toDbDate(input.endDate) },
        endDate: { gte: toDbDate(input.startDate) },
      },
    });
    if (clash) {
      throw ApiException.validation({
        startDate: [
          `Overlaps "${clash.name}" (${fromDbDate(clash.startDate)} to ${fromDbDate(clash.endDate)})`,
        ],
      });
    }
  }

  /** Employees and owners arrive in M6. */
  protected async employeeCounts(): Promise<Map<string, number>> {
    return new Map();
  }

  protected async owner(): Promise<CompanyDetail['owner']> {
    return null;
  }
}
