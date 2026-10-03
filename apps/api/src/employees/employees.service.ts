import { HttpStatus, Injectable } from '@nestjs/common';
import {
  EMPLOYEE_CSV_COLUMNS,
  ErrorCode,
  MAX_IMPORT_ROWS,
  checkEmployeeRow,
  emailDomain,
  pageOffset,
  parseCsv,
  type EmployeeImportResult,
  type EmployeeInputSchema,
  type EmployeeListQuery,
  type EmployeeSummary,
  type ImportRowError,
  type Paginated,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { ApiException } from '../common/api-exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type EmployeeBody = z.output<typeof EmployeeInputSchema>;

const EMPLOYEE_INCLUDE = {
  company: { select: { id: true, name: true, ownerId: true } },
  allergies: { include: { allergen: { select: { id: true, name: true, sortOrder: true } } } },
  dietaryPreferences: {
    include: { dietaryTag: { select: { id: true, name: true, sortOrder: true } } },
  },
} as const satisfies Prisma.EmployeeInclude;

type EmployeeRow = Prisma.EmployeeGetPayload<{ include: typeof EMPLOYEE_INCLUDE }>;

const bySort = (a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder;

function toSummary(row: EmployeeRow): EmployeeSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: { id: row.company.id, name: row.company.name },
    isOwner: row.company.ownerId === row.id,
    canChooseAddress: row.canChooseAddress,
    canChangeDeliveryTime: row.canChangeDeliveryTime,
    canChangePackaging: row.canChangePackaging,
    allergies: row.allergies
      .map((a) => a.allergen)
      .sort(bySort)
      .map(({ id, name }) => ({ id, name })),
    dietaryPreferences: row.dietaryPreferences
      .map((d) => d.dietaryTag)
      .sort(bySort)
      .map(({ id, name }) => ({ id, name })),
  };
}

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: EmployeeListQuery): Promise<Paginated<EmployeeSummary>> {
    const where: Prisma.EmployeeWhereInput = {
      ...(query.companyId && { companyId: query.companyId }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q.toLowerCase() } },
        ],
      }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        include: EMPLOYEE_INCLUDE,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: pageOffset(query),
        take: query.pageSize,
      }),
      this.prisma.employee.count({ where }),
    ]);
    return { items: rows.map(toSummary), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<EmployeeSummary> {
    const row = await this.prisma.employee.findUnique({ where: { id }, include: EMPLOYEE_INCLUDE });
    if (!row) throw ApiException.notFound('Employee');
    return toSummary(row);
  }

  async create(input: EmployeeBody): Promise<EmployeeSummary> {
    await this.validate(input);
    const row = await this.prisma.employee.create({ data: this.data(input) });
    return this.get(row.id);
  }

  /**
   * Updates an employee, including moving them to another company (the new company's rules,
   * prices and menu then apply). Their email must be on the new company's domains (decision 25).
   */
  async update(id: string, input: EmployeeBody): Promise<EmployeeSummary> {
    const existing = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        company: { select: { ownerId: true } },
        allergies: true,
        dietaryPreferences: true,
      },
    });
    if (!existing) throw ApiException.notFound('Employee');
    if (existing.companyId !== input.companyId && existing.company.ownerId === id) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.OwnerCannotMove,
        'This employee owns their company. Make someone else the owner before moving them.',
      );
    }
    await this.validate(input, id, {
      allergenIds: new Set(existing.allergies.map((a) => a.allergenId)),
      dietaryTagIds: new Set(existing.dietaryPreferences.map((d) => d.dietaryTagId)),
    });
    await this.prisma.$transaction([
      this.prisma.employeeAllergen.deleteMany({ where: { employeeId: id } }),
      this.prisma.employeeDietaryTag.deleteMany({ where: { employeeId: id } }),
      this.prisma.employee.update({ where: { id }, data: this.data(input) }),
    ]);
    return this.get(id);
  }

  /** The owner must be one of the company's employees (also enforced by a composite foreign key). */
  async setOwner(companyId: string, employeeId: string | null): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) throw ApiException.notFound('Company');
    if (employeeId) {
      const employee = await this.prisma.employee.findFirst({
        where: { id: employeeId, companyId },
      });
      if (!employee)
        throw ApiException.validation({ employeeId: ['Choose one of this company’s employees'] });
    }
    await this.prisma.company.update({ where: { id: companyId }, data: { ownerId: employeeId } });
  }

  /**
   * Bulk import from CSV (brief 4.5 [Should]). Each row is checked on its own: good rows are
   * created, bad rows are reported with every reason, and one bad row never blocks the others.
   */
  async importCsv(
    companyId: string,
    file: Express.Multer.File | undefined,
  ): Promise<EmployeeImportResult> {
    if (!file) throw ApiException.validation({ file: ['Choose a CSV file'] });
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { domains: { select: { domain: true } } },
    });
    if (!company) throw ApiException.notFound('Company');

    const rows = parseCsv(file.buffer.toString('utf8'));
    const header = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
    const missing = EMPLOYEE_CSV_COLUMNS.filter((c) => c !== 'phone' && !header.includes(c));
    if (missing.length > 0) {
      throw ApiException.validation({
        file: [`Missing column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`],
      });
    }
    if (rows.length === 0)
      throw ApiException.validation({ file: ['The file has no employee rows'] });
    if (rows.length > MAX_IMPORT_ROWS) {
      throw ApiException.validation({ file: [`At most ${MAX_IMPORT_ROWS} rows per file`] });
    }

    const records = rows.map((cells) =>
      Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])),
    );
    const emails = records.map((r) => (r.email ?? '').trim().toLowerCase()).filter(Boolean);
    const [allergens, tags, existing] = await Promise.all([
      this.prisma.allergen.findMany({ where: { isActive: true } }),
      this.prisma.dietaryTag.findMany({ where: { isActive: true } }),
      this.prisma.employee.findMany({ where: { email: { in: emails } }, select: { email: true } }),
    ]);
    const context = {
      companyId,
      companyDomains: company.domains.map((d) => d.domain),
      allergenIds: new Map(allergens.map((a) => [a.name.toLowerCase(), a.id])),
      dietaryTagIds: new Map(tags.map((t) => [t.name.toLowerCase(), t.id])),
      existingEmails: new Set(existing.map((e) => e.email)),
    };

    const seen = new Set<string>();
    const errors: ImportRowError[] = [];
    const accepted: EmployeeBody[] = [];
    records.forEach((record, index) => {
      const result = checkEmployeeRow(record, context, seen);
      if (result.ok) {
        seen.add(result.input.email);
        accepted.push(result.input);
      } else {
        // +2: the header is row 1 and spreadsheets count from 1.
        errors.push({ row: index + 2, email: record.email ?? '', messages: result.messages });
      }
    });

    // All good rows go in together: either every accepted row is created or none (then retry).
    await this.prisma.$transaction(
      accepted.map((input) => this.prisma.employee.create({ data: this.data(input) })),
    );
    return { created: accepted.length, errors };
  }

  private data(input: EmployeeBody) {
    return {
      companyId: input.companyId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      canChooseAddress: input.canChooseAddress,
      canChangeDeliveryTime: input.canChangeDeliveryTime,
      canChangePackaging: input.canChangePackaging,
      allergies: { create: input.allergenIds.map((allergenId) => ({ allergenId })) },
      dietaryPreferences: { create: input.dietaryTagIds.map((dietaryTagId) => ({ dietaryTagId })) },
    };
  }

  private async validate(
    input: EmployeeBody,
    employeeId?: string,
    current?: { allergenIds: Set<string>; dietaryTagIds: Set<string> },
  ): Promise<void> {
    const [company, emailClash, allergens, tags] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: input.companyId },
        include: { domains: true },
      }),
      this.prisma.employee.findFirst({
        where: { email: input.email, ...(employeeId && { id: { not: employeeId } }) },
        include: { company: { select: { name: true } } },
      }),
      this.prisma.allergen.findMany({ where: { id: { in: input.allergenIds } } }),
      this.prisma.dietaryTag.findMany({ where: { id: { in: input.dietaryTagIds } } }),
    ]);
    const errors: Record<string, string[]> = {};
    if (!company) {
      errors.companyId = ['That company no longer exists'];
    } else {
      const domains = company.domains.map((d) => d.domain);
      if (!domains.includes(emailDomain(input.email))) {
        errors.email = [`Must be an email on ${domains.map((d) => `@${d}`).join(' or ')}`];
      }
    }
    if (emailClash)
      errors.email = [`Already used by ${emailClash.name} (${emailClash.company.name})`];
    const usable = (rows: { id: string; isActive: boolean }[], ids: string[], kept?: Set<string>) =>
      ids.every((id) => rows.some((r) => r.id === id && (r.isActive || kept?.has(id))));
    if (!usable(allergens, input.allergenIds, current?.allergenIds))
      errors.allergenIds = ['Some allergens are inactive or gone. Reload the page.'];
    if (!usable(tags, input.dietaryTagIds, current?.dietaryTagIds))
      errors.dietaryTagIds = ['Some dietary tags are inactive or gone. Reload the page.'];
    if (Object.keys(errors).length > 0) throw ApiException.validation(errors);
  }
}
