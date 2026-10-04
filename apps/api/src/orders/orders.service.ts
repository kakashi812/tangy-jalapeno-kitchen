import { HttpStatus, Injectable } from '@nestjs/common';
import {
  OrderRuleError,
  computeCutoff,
  isKitchenWorkingDay,
  kitchenDateTimeToUtc,
  orderNumber,
  pageOffset,
  sameLine,
  snapshotLine,
  validateSnapshot,
  formatKitchenTime,
  type LineSnapshot,
  type OrderContext,
  type OrderDetail,
  type OrderInput,
  type OrderLine,
  type OrderListQuery,
  type OrderSummary,
  type Paginated,
  type SessionUser,
  type OrderActionSchema,
  type OrderOverrideSchema,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { ApiException } from '../common/api-exception.js';
import { DropMembershipService } from '../drops/drop-membership.service.js';
import { isTransactionConflict } from '../common/transaction-conflict.js';
import { fromDbDate, toDbDate } from '../common/db-dates.js';
import { Prisma, type Order } from '../generated/prisma/client.js';
import { MenuService } from '../menu/menu.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  cutoffStatus,
  has,
  orderPermissions,
  requireAction,
  requireVersion,
} from './orders.policy.js';

const INCLUDE = {
  lines: {
    orderBy: { sortOrder: 'asc' },
    include: { combinations: { orderBy: { sortOrder: 'asc' } } },
  },
  events: {
    orderBy: [{ at: 'asc' }, { sequence: 'asc' }],
    include: { actor: { select: { name: true } } },
  },
} as const satisfies Prisma.OrderInclude;
type FullOrder = Prisma.OrderGetPayload<{ include: typeof INCLUDE }>;
type LineRow = FullOrder['lines'][number];
type Tx = Prisma.TransactionClient;
type Action = z.infer<typeof OrderActionSchema>;
type Override = z.infer<typeof OrderOverrideSchema>;

/** Only server-written, validated snapshots are decoded here; catalogue is never consulted. */
export function savedLine(row: LineRow): OrderLine {
  return {
    id: row.id,
    menuItemId: row.menuItemId,
    dishId: row.dishId,
    name: row.name,
    sku: row.sku,
    temperature: row.temperature,
    stationId: row.stationId,
    stationName: row.stationName,
    minOrderQty: row.minOrderQty,
    quantity: row.quantity,
    dishPriceCents: row.dishPriceCents,
    groups: row.groups as LineSnapshot['groups'],
    totalCents: row.totalCents,
    combinationIds: row.combinations.map((c) => c.id),
    combinations: row.combinations.map((c) => ({
      quantity: c.quantity,
      options: c.options as LineSnapshot['combinations'][number]['options'],
      unitPriceCents: c.unitPriceCents,
      totalCents: c.totalCents,
    })),
  };
}

export function summary(row: Order, money: boolean): OrderSummary {
  return {
    id: row.id,
    number: orderNumber(row.sequence),
    employee: { id: row.employeeId, name: row.employeeName },
    company: { id: row.companyId, name: row.companyName },
    deliveryDate: fromDbDate(row.deliveryDate),
    deliveryTimeMinutes: row.deliveryTimeMinutes,
    status: row.status,
    ...(money && { totalCents: row.totalCents }),
    invoiced: row.invoiceId !== null,
    kitchenStartedAt: row.kitchenStartedAt?.toISOString() ?? null,
    kitchenReadyAt: row.kitchenReadyAt?.toISOString() ?? null,
  };
}

export function visibleLine(line: OrderLine, money: boolean): OrderDetail['lines'][number] {
  if (money) return line;
  // Explicit projection prevents nested JSON prices leaking to kitchen/dispatch roles.
  return {
    id: line.id,
    menuItemId: line.menuItemId,
    dishId: line.dishId,
    name: line.name,
    sku: line.sku,
    temperature: line.temperature,
    stationId: line.stationId,
    stationName: line.stationName,
    minOrderQty: line.minOrderQty,
    quantity: line.quantity,
    groups: line.groups,
    combinationIds: line.combinationIds,
    combinations: line.combinations.map((c) => ({
      quantity: c.quantity,
      options: c.options.map((o) => ({
        id: o.id,
        name: o.name,
        groupId: o.groupId,
        groupName: o.groupName,
      })),
    })),
  };
}

function lineData(line: LineSnapshot, sortOrder: number) {
  return {
    menuItemId: line.menuItemId,
    dishId: line.dishId,
    name: line.name,
    sku: line.sku,
    temperature: line.temperature,
    stationId: line.stationId,
    stationName: line.stationName,
    minOrderQty: line.minOrderQty,
    quantity: line.quantity,
    dishPriceCents: line.dishPriceCents,
    groups: line.groups,
    totalCents: line.totalCents,
    sortOrder,
    combinations: { create: line.combinations.map((c, i) => ({ ...c, sortOrder: i })) },
  };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly menu: MenuService,
    private readonly settings: SettingsService,
    private readonly drops: DropMembershipService,
  ) {}

  /** Retry serialization failures only. Every operation is wholly rolled back before a retry. */
  async transaction<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(run, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30_000,
        });
      } catch (error) {
        if (isTransactionConflict(error)) {
          if (attempt < 2) continue;
          throw new ApiException(
            HttpStatus.CONFLICT,
            'CONCURRENT_UPDATE',
            'Someone else changed this at the same moment. Refresh and try again.',
          );
        }
        if (error instanceof OrderRuleError) throw ApiException.validation(error.fieldErrors);
        throw error;
      }
    }
  }

  async companies() {
    return this.prisma.company.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  async employees(q: string, page: number, pageSize: number) {
    const where: Prisma.EmployeeWhereInput = {
      company: { isActive: true },
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { company: { name: { contains: q, mode: 'insensitive' } } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true, email: true, company: { select: { name: true } } },
      }),
      this.prisma.employee.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async context(
    employeeId: string,
    deliveryDate: string,
    codes: string[] = [],
  ): Promise<OrderContext> {
    await this.processDue();
    return this.transaction(
      async (tx) => (await this.loadContext(tx, employeeId, deliveryDate, codes)).context,
    );
  }

  async editContext(id: string): Promise<OrderContext> {
    await this.processDue();
    return this.transaction(async (tx) => {
      const row = await this.requireOrder(tx, id);
      const loaded = await this.loadContext(
        tx,
        row.employeeId,
        fromDbDate(row.deliveryDate),
        [],
        row.companyId,
      );
      return {
        ...loaded.context,
        cutoffAt: row.cutoffAt.toISOString(),
        closed:
          !!(await tx.orderClosure.findUnique({ where: { deliveryDate: row.deliveryDate } })) ||
          row.cutoffAt <= new Date(),
      };
    });
  }

  private async loadContext(
    tx: Tx,
    employeeId: string,
    deliveryDate: string,
    codes: string[],
    companyId?: string,
  ) {
    const [employee, settings, holidays, menu, packagingTypes, closure] = await Promise.all([
      tx.employee.findUnique({
        where: { id: employeeId },
        include: {
          company: {
            include: {
              addresses: { orderBy: [{ isDefault: 'desc' }, { label: 'asc' }] },
              holidays: true,
            },
          },
        },
      }),
      this.settings.get(tx),
      this.settings.listHolidays(tx),
      this.menu.forEmployee(employeeId, codes, tx),
      tx.packagingType.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true },
      }),
      tx.orderClosure.findUnique({ where: { deliveryDate: toDbDate(deliveryDate) } }),
    ]);
    if (!employee) throw ApiException.notFound('Employee');
    const company =
      companyId && companyId !== employee.companyId
        ? await tx.company.findUniqueOrThrow({
            where: { id: companyId },
            include: {
              addresses: { orderBy: [{ isDefault: 'desc' }, { label: 'asc' }] },
              holidays: true,
            },
          })
        : employee.company;
    const calendar = { workingDays: settings.kitchenWorkingDays, holidays };
    const cutoff = computeCutoff(
      deliveryDate,
      { daysBefore: settings.cutoffDaysBefore, timeMinutes: settings.cutoffTimeMinutes },
      calendar,
    );
    const context: OrderContext = {
      menu,
      addresses: company.addresses.map((a) => ({
        id: a.id,
        label: a.label,
        isDefault: a.isDefault,
        text: [a.label, a.line1, a.line2, a.city, a.postcode, a.deliveryNotes]
          .filter(Boolean)
          .join(', '),
      })),
      packagingTypes,
      defaults: {
        addressId: company.addresses.find((a) => a.isDefault)?.id ?? '',
        deliveryTimeMinutes: company.defaultDeliveryTimeMinutes,
        packagingTypeId: company.defaultPackagingTypeId,
      },
      flags: {
        canChooseAddress: employee.canChooseAddress,
        canChangeDeliveryTime: employee.canChangeDeliveryTime,
        canChangePackaging: employee.canChangePackaging,
      },
      cutoffAt: cutoff.toISOString(),
      closed: !!closure || cutoff <= new Date(),
      companyActive: company.isActive,
      deliveryDate,
      deliveryWindowStartMinutes: settings.deliveryWindowStartMinutes,
      deliveryWindowEndMinutes: settings.deliveryWindowEndMinutes,
    };
    return { ...context, context, company, calendar, settings };
  }

  private async requireOrder(tx: Tx, id: string) {
    const row = await tx.order.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw ApiException.notFound('Order');
    return row;
  }

  async list(query: OrderListQuery, user: SessionUser): Promise<Paginated<OrderSummary>> {
    await this.processDue();
    const where: Prisma.OrderWhereInput = {
      ...(query.from || query.to
        ? {
            deliveryDate: {
              ...(query.from && { gte: toDbDate(query.from) }),
              ...(query.to && { lte: toDbDate(query.to) }),
            },
          }
        : {}),
      ...(query.status && { status: query.status }),
      ...(query.companyId && { companyId: query.companyId }),
      ...(query.invoiced && { invoiceId: query.invoiced === 'true' ? { not: null } : null }),
    };
    if (query.q) {
      const number = /^FL-(\d+)$/i.exec(query.q);
      where.OR = [
        { employeeName: { contains: query.q, mode: 'insensitive' } },
        { companyName: { contains: query.q, mode: 'insensitive' } },
        ...(number && Number(number[1]) <= 2_147_483_647 ? [{ sequence: Number(number[1]) }] : []),
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip: pageOffset(query),
        take: query.pageSize,
        orderBy: [{ deliveryDate: 'desc' }, { deliveryTimeMinutes: 'asc' }, { sequence: 'desc' }],
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      items: rows.map((row) => summary(row, has(user, 'orders.readMoney'))),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string, user: SessionUser): Promise<OrderDetail> {
    await this.processDue();
    const row = await this.requireOrder(this.prisma, id);
    const closure = await this.prisma.orderClosure.findUnique({
      where: { deliveryDate: row.deliveryDate },
    });
    const money = has(user, 'orders.readMoney');
    return {
      ...summary(row, money),
      ...(has(user, 'billing.read') && {
        invoiceId: row.invoiceId,
        billingReviewReason: row.billingReviewReason,
        shortDeliveryNote: row.shortDeliveryNote,
      }),
      version: row.version,
      cutoffAt: row.cutoffAt.toISOString(),
      locked: !!closure || row.cutoffAt <= new Date(),
      addressId: row.addressId,
      addressText: row.addressText,
      packagingTypeId: row.packagingTypeId,
      packagingName: row.packagingName,
      notes: row.notes,
      driverInstructions: row.driverInstructions,
      dispatchLeadMinutes: row.dispatchLeadMinutes,
      plannedKitchenReadyAt: row.plannedKitchenReadyAt.toISOString(),
      plannedDispatchReadyAt: row.plannedDispatchReadyAt.toISOString(),
      outForDeliveryAt: row.outForDeliveryAt?.toISOString() ?? null,
      lines: row.lines.map((l) => visibleLine(savedLine(l), money)),
      events: row.events.map((e) => ({
        id: e.id,
        type: e.type,
        description: e.description,
        at: e.at.toISOString(),
        actor: e.actor?.name ?? null,
      })),
      permissions: orderPermissions(row, user, !!closure, new Date()),
    };
  }

  private async duplicate(tx: Tx, employeeId: string, deliveryDate: string, exceptId?: string) {
    const existing = await tx.order.findFirst({
      where: {
        employeeId,
        deliveryDate: toDbDate(deliveryDate),
        status: { notIn: ['CANCELLED', 'REJECTED'] },
        ...(exceptId && { id: { not: exceptId } }),
      },
    });
    if (existing)
      throw new ApiException(
        HttpStatus.CONFLICT,
        'ORDER_EXISTS',
        `${orderNumber(existing.sequence)} already exists for this employee and date`,
        { existingOrderId: [existing.id] },
      );
  }

  private async prepare(tx: Tx, input: OrderInput, user: SessionUser, existing?: FullOrder) {
    if (existing && existing.employeeId !== input.employeeId)
      throw ApiException.validation({
        employeeId: ['The employee cannot be changed on an existing order'],
      });
    const ctx = await this.loadContext(
      tx,
      input.employeeId,
      input.deliveryDate,
      input.secretCodes,
      existing?.companyId,
    );
    if (!existing && !ctx.company.isActive)
      throw ApiException.validation({
        employeeId: ['This company is inactive and cannot take new orders'],
      });
    const dateChanged = !existing || fromDbDate(existing.deliveryDate) !== input.deliveryDate;
    if (existing?.status === 'CONFIRMED' && dateChanged)
      throw ApiException.validation({
        deliveryDate: ['The delivery date cannot change after confirmation'],
      });
    if (
      dateChanged &&
      (!isKitchenWorkingDay(input.deliveryDate, ctx.calendar) ||
        !isKitchenWorkingDay(input.deliveryDate, {
          workingDays: ctx.company.workingDays,
          holidays: ctx.company.holidays.map((h) => ({
            startDate: fromDbDate(h.startDate),
            endDate: fromDbDate(h.endDate),
          })),
        }))
    ) {
      throw ApiException.validation({
        deliveryDate: [
          'Choose a working day for both the kitchen and company, outside their holidays',
        ],
      });
    }
    const cutoffAt = dateChanged ? new Date(ctx.cutoffAt) : existing.cutoffAt;
    const closure = await tx.orderClosure.findUnique({
      where: { deliveryDate: toDbDate(input.deliveryDate) },
    });
    const locked = !!closure || cutoffAt <= new Date();
    if (locked && !has(user, 'orders.override'))
      throw new ApiException(
        HttpStatus.CONFLICT,
        'CUTOFF_PASSED',
        'Orders for this date are closed',
      );
    if (locked && input.intent === 'draft')
      throw ApiException.validation({
        intent: ['Closed dates accept placed admin orders, not new drafts'],
      });
    if (existing && existing.status !== 'DRAFT' && input.intent === 'draft')
      throw ApiException.validation({
        intent: ['A placed or confirmed order cannot return to draft'],
      });
    const address = ctx.addresses.find((a) => a.id === input.addressId);
    const packaging = await tx.packagingType.findUnique({ where: { id: input.packagingTypeId } });
    const errors: Record<string, string[]> = {};
    if (!address) errors.addressId = ['Choose an address belonging to this company'];
    if (!packaging || (!packaging.isActive && existing?.packagingTypeId !== input.packagingTypeId))
      errors.packagingTypeId = ['Choose an active packaging type'];
    // Staff normally act as the employee; override permission explicitly bypasses their locks.
    // Company ownership, active packaging and the platform delivery window still apply below.
    const checkFlags = !has(user, 'orders.override');
    if (
      checkFlags &&
      !ctx.flags.canChooseAddress &&
      input.addressId !== (existing?.addressId ?? ctx.defaults.addressId)
    )
      errors.addressId = ['This employee uses the company’s default address'];
    if (
      checkFlags &&
      !ctx.flags.canChangeDeliveryTime &&
      input.deliveryTimeMinutes !==
        (existing?.deliveryTimeMinutes ?? ctx.defaults.deliveryTimeMinutes)
    )
      errors.deliveryTimeMinutes = ['This employee uses the company’s default delivery time'];
    if (
      checkFlags &&
      !ctx.flags.canChangePackaging &&
      input.packagingTypeId !== (existing?.packagingTypeId ?? ctx.defaults.packagingTypeId)
    )
      errors.packagingTypeId = ['This employee uses the company’s default packaging'];
    if (
      input.deliveryTimeMinutes !== existing?.deliveryTimeMinutes &&
      (input.deliveryTimeMinutes < ctx.deliveryWindowStartMinutes ||
        input.deliveryTimeMinutes > ctx.deliveryWindowEndMinutes)
    )
      errors.deliveryTimeMinutes = ['Choose a time within the platform delivery window'];
    if (input.intent === 'place' && !input.lines.length)
      errors.lines = ['Add at least one dish before placing'];
    if (new Set(input.lines.map((l) => l.menuItemId)).size !== input.lines.length)
      errors.lines = ['Each menu item may appear once; add its combinations to the same line'];
    const lineIds = input.lines.flatMap((l) => (l.id ? [l.id] : []));
    if (
      new Set(lineIds).size !== lineIds.length ||
      lineIds.some((id) => !existing?.lines.some((l) => l.id === id))
    )
      errors.lines = ['Some line IDs do not belong to this order'];
    if (Object.keys(errors).length) throw ApiException.validation(errors);
    const dishes = ctx.menu.categories.flatMap((c) => c.dishes);
    const stations = await tx.dish.findMany({
      where: { id: { in: dishes.map((d) => d.dishId) } },
      select: { id: true, stationId: true, station: { select: { name: true } } },
    });
    const lines = input.lines.map((line, index) => {
      const saved = existing?.lines.find((l) => l.id === line.id);
      if (saved && sameLine(line, savedLine(saved))) {
        const snapshot = savedLine(saved);
        validateSnapshot(snapshot, index, input.intent === 'place');
        return { snapshot, unchangedId: saved.id };
      }
      const dish = dishes.find((d) => d.menuItemId === line.menuItemId);
      if (!dish)
        throw ApiException.validation({
          [`lines.${index}.menuItemId`]: [
            'This dish is not available on the employee’s menu; remove it or keep its original saved line unchanged',
          ],
        });
      const snapshot = snapshotLine(line, dish, index, input.intent === 'place');
      const station = stations.find((s) => s.id === dish.dishId);
      snapshot.stationId = station?.stationId ?? null;
      snapshot.stationName = station?.station?.name ?? null;
      return { snapshot, unchangedId: null };
    });
    const totalCents = lines.reduce((n, l) => n + l.snapshot.totalCents, 0);
    if (!Number.isSafeInteger(totalCents) || totalCents > 2_147_483_647)
      throw ApiException.validation({
        lines: ['The order exceeds the supported amount; reduce quantities'],
      });
    const lead = existing?.dispatchLeadMinutes ?? ctx.company.dispatchLeadMinutes;
    const buffer = existing?.kitchenBufferMinutes ?? ctx.settings.kitchenReadyBufferMinutes;
    const dispatch = new Date(
      kitchenDateTimeToUtc(input.deliveryDate, input.deliveryTimeMinutes).getTime() - lead * 60_000,
    );
    const data = {
      employeeId: input.employeeId,
      employeeName: existing?.employeeName ?? ctx.menu.employee.name,
      companyId: existing?.companyId ?? ctx.company.id,
      companyName: existing?.companyName ?? ctx.company.name,
      deliveryDate: toDbDate(input.deliveryDate),
      deliveryTimeMinutes: input.deliveryTimeMinutes,
      addressId: input.addressId,
      addressText: existing?.addressId === input.addressId ? existing.addressText : address!.text,
      packagingTypeId: input.packagingTypeId,
      packagingName:
        existing?.packagingTypeId === input.packagingTypeId
          ? existing.packagingName
          : packaging!.name,
      notes: input.notes,
      driverInstructions: existing?.driverInstructions ?? ctx.company.driverInstructions,
      cutoffAt,
      dispatchLeadMinutes: lead,
      kitchenBufferMinutes: buffer,
      plannedDispatchReadyAt: dispatch,
      plannedKitchenReadyAt: new Date(dispatch.getTime() - buffer * 60_000),
      totalCents,
      status:
        existing?.status === 'CONFIRMED'
          ? ('CONFIRMED' as const)
          : input.intent === 'draft'
            ? ('DRAFT' as const)
            : locked
              ? ('CONFIRMED' as const)
              : ('PLACED' as const),
    };
    await this.duplicate(tx, input.employeeId, input.deliveryDate, existing?.id);
    return { data, lines };
  }

  async create(input: OrderInput, user: SessionUser) {
    await this.processDue();
    let id: string;
    try {
      id = await this.transaction(async (tx) => {
        const prepared = await this.prepare(tx, input, user);
        const row = await tx.order.create({
          data: {
            ...prepared.data,
            lines: { create: prepared.lines.map((l, i) => lineData(l.snapshot, i)) },
          },
        });
        await this.event(tx, row.id, 'CREATED', 'Order created', user.id);
        if (row.status !== 'DRAFT') await this.event(tx, row.id, 'PLACED', 'Order placed', user.id);
        if (row.status === 'CONFIRMED') {
          await this.createPrep(tx, row.id);
          await this.event(
            tx,
            row.id,
            'CONFIRMED',
            'Admin placed an order after closure; confirmed immediately',
            user.id,
          );
        }
        return row.id;
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
        await this.duplicate(this.prisma, input.employeeId, input.deliveryDate);
      throw error;
    }
    return { id };
  }

  async update(id: string, input: OrderInput, user: SessionUser) {
    await this.processDue();
    await this.transaction(async (tx) => {
      const existing = await this.requireOrder(tx, id);
      requireVersion(existing.version, input.version);
      const closure = await tx.orderClosure.findUnique({
        where: { deliveryDate: existing.deliveryDate },
      });
      requireAction(orderPermissions(existing, user, !!closure, new Date()).edit);
      const prepared = await this.prepare(tx, input, user, existing);
      await tx.order.update({
        where: { id, version: input.version },
        data: { ...prepared.data, version: { increment: 1 } },
      });
      const keep = prepared.lines.flatMap((l) => (l.unchangedId ? [l.unchangedId] : []));
      await tx.orderLine.deleteMany({ where: { orderId: id, id: { notIn: keep } } });
      for (const [index, line] of prepared.lines.entries()) {
        if (line.unchangedId)
          await tx.orderLine.update({
            where: { id: line.unchangedId },
            data: { sortOrder: index },
          });
        else
          await tx.orderLine.create({ data: { ...lineData(line.snapshot, index), orderId: id } });
      }
      await this.event(
        tx,
        id,
        'EDITED',
        'Order edited; unchanged lines retain their saved prices',
        user.id,
      );
      if (existing.status === 'DRAFT' && prepared.data.status !== 'DRAFT')
        await this.event(tx, id, 'PLACED', 'Order placed', user.id);
      if (prepared.data.status === 'CONFIRMED') {
        await this.createPrep(tx, id);
        if (existing.status !== 'CONFIRMED')
          await this.event(tx, id, 'CONFIRMED', 'Order confirmed after closure', user.id);
      }
      await this.drops.sync(tx, id);
    });
    return { id };
  }

  async action(
    id: string,
    action: 'place' | 'cancel' | 'reject',
    input: Action,
    user: SessionUser,
  ) {
    await this.processDue();
    await this.transaction(async (tx) => {
      const row = await this.requireOrder(tx, id);
      requireVersion(row.version, input.version);
      const closure = await tx.orderClosure.findUnique({
        where: { deliveryDate: row.deliveryDate },
      });
      requireAction(orderPermissions(row, user, !!closure, new Date())[action]);
      if (action === 'reject' && !input.reason)
        throw ApiException.validation({ reason: ['Explain why this order is rejected'] });
      if (action === 'place') {
        if (!row.lines.length) throw ApiException.validation({ lines: ['Add at least one dish'] });
        row.lines.forEach((l, i) => validateSnapshot(savedLine(l), i, true));
      }
      const status =
        action === 'cancel'
          ? 'CANCELLED'
          : action === 'reject'
            ? 'REJECTED'
            : closure || row.cutoffAt <= new Date()
              ? 'CONFIRMED'
              : 'PLACED';
      await tx.order.update({
        where: { id, version: input.version },
        data: {
          status,
          ...(row.invoiceId && {
            billingReviewReason: `Order ${action === 'cancel' ? 'cancelled' : 'rejected'} after invoicing${input.reason ? `: ${input.reason}` : ''}`,
          }),
          version: { increment: 1 },
        },
      });
      await this.event(
        tx,
        id,
        action === 'place' ? 'PLACED' : status,
        `${action === 'place' ? 'Order placed' : action === 'cancel' ? 'Order cancelled' : 'Order rejected'}${input.reason ? `: ${input.reason}` : ''}`,
        user.id,
      );
      if (status === 'CONFIRMED') {
        await this.createPrep(tx, id);
        await this.event(tx, id, 'CONFIRMED', 'Order confirmed after closure', user.id);
      }
      await this.drops.sync(tx, id);
    });
    return { id };
  }

  async override(id: string, input: Override, user: SessionUser) {
    await this.processDue();
    await this.transaction(async (tx) => {
      const row = await this.requireOrder(tx, id);
      requireVersion(row.version, input.version);
      requireAction(orderPermissions(row, user, true, new Date()).override);
      const [address, packaging, settings] = await Promise.all([
        tx.companyAddress.findFirst({ where: { id: input.addressId, companyId: row.companyId } }),
        tx.packagingType.findUnique({ where: { id: input.packagingTypeId } }),
        this.settings.get(tx),
      ]);
      const errors: Record<string, string[]> = {};
      if (!address) errors.addressId = ['Choose an address belonging to this company'];
      if (!packaging || (!packaging.isActive && row.packagingTypeId !== input.packagingTypeId))
        errors.packagingTypeId = ['Choose an active packaging type'];
      if (
        input.deliveryTimeMinutes !== row.deliveryTimeMinutes &&
        (input.deliveryTimeMinutes < settings.deliveryWindowStartMinutes ||
          input.deliveryTimeMinutes > settings.deliveryWindowEndMinutes)
      )
        errors.deliveryTimeMinutes = ['Choose a time within the platform delivery window'];
      if (Object.keys(errors).length) throw ApiException.validation(errors);
      const addressText =
        input.addressId === row.addressId
          ? row.addressText
          : [
              address!.label,
              address!.line1,
              address!.line2,
              address!.city,
              address!.postcode,
              address!.deliveryNotes,
            ]
              .filter(Boolean)
              .join(', ');
      const packagingName =
        input.packagingTypeId === row.packagingTypeId ? row.packagingName : packaging!.name;
      const dispatch = new Date(
        kitchenDateTimeToUtc(fromDbDate(row.deliveryDate), input.deliveryTimeMinutes).getTime() -
          row.dispatchLeadMinutes * 60_000,
      );
      await tx.order.update({
        where: { id, version: input.version },
        data: {
          addressId: input.addressId,
          addressText,
          packagingTypeId: input.packagingTypeId,
          packagingName,
          deliveryTimeMinutes: input.deliveryTimeMinutes,
          plannedDispatchReadyAt: dispatch,
          plannedKitchenReadyAt: new Date(dispatch.getTime() - row.kitchenBufferMinutes * 60_000),
          ...(row.invoiceId && {
            billingReviewReason: `Delivery overridden after invoicing: ${input.reason}`,
          }),
          version: { increment: 1 },
        },
      });
      await this.event(
        tx,
        id,
        'OVERRIDDEN',
        `Delivery ${formatKitchenTime(kitchenDateTimeToUtc(fromDbDate(row.deliveryDate), row.deliveryTimeMinutes))} → ${formatKitchenTime(kitchenDateTimeToUtc(fromDbDate(row.deliveryDate), input.deliveryTimeMinutes))}; address ${row.addressText} → ${addressText}; packaging ${row.packagingName} → ${packagingName}. Reason: ${input.reason}`,
        user.id,
      );
      await this.drops.sync(tx, id);
    });
    return { id };
  }

  async overrideChoices(id: string) {
    const row = await this.requireOrder(this.prisma, id);
    const [addresses, packaging] = await Promise.all([
      this.prisma.companyAddress.findMany({
        where: { companyId: row.companyId },
        select: { id: true, label: true },
        orderBy: { label: 'asc' },
      }),
      this.prisma.packagingType.findMany({
        where: { OR: [{ isActive: true }, { id: row.packagingTypeId }] },
        select: { id: true, name: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);
    return { addresses, packagingTypes: packaging };
  }

  private async createPrep(tx: Tx, orderId: string) {
    const lines = await tx.orderLine.findMany({
      where: { orderId },
      include: { combinations: { select: { id: true } } },
    });
    await tx.prepUnit.createMany({
      data: lines.flatMap((l) =>
        l.combinations.map((c) => ({
          combinationId: c.id,
          stationId: l.stationId,
          stationName: l.stationName,
        })),
      ),
      skipDuplicates: true,
    });
    await this.drops.sync(tx, orderId);
  }

  async event(
    tx: Tx,
    orderId: string,
    type: string,
    description: string,
    actorId: string | null = null,
  ) {
    return tx.orderEvent.create({ data: { orderId, type, description, actorId } });
  }

  /** Bounded batches, conditional status/version writes and transactional events make this repeatable. */
  async processDue() {
    let confirmed = 0,
      cancelled = 0;
    for (;;) {
      // Fast no-op path keeps ordinary reads cheap when nothing is due.
      const closures = await this.prisma.orderClosure.findMany();
      const where: Prisma.OrderWhereInput = {
        status: { in: ['DRAFT', 'PLACED'] },
        OR: [
          { cutoffAt: { lte: new Date() } },
          { deliveryDate: { in: closures.map((c) => c.deliveryDate) } },
        ],
      };
      if (!(await this.prisma.order.findFirst({ where, select: { id: true } }))) break;
      const result = await this.transaction(async (tx) => {
        const closures = await tx.orderClosure.findMany();
        const pending = await tx.order.findMany({
          where: {
            status: { in: ['DRAFT', 'PLACED'] },
            OR: [
              { cutoffAt: { lte: new Date() } },
              { deliveryDate: { in: closures.map((c) => c.deliveryDate) } },
            ],
          },
          take: 100,
          orderBy: { id: 'asc' },
          include: { lines: { include: { combinations: { select: { id: true } } } } },
        });
        const drafts = pending.filter((o) => o.status === 'DRAFT');
        const placed = pending.filter((o) => o.status === 'PLACED');
        // Serializable isolation protects snapshot reads against edits/other cutoff workers.
        for (const [rows, status] of [
          [drafts, 'CANCELLED'],
          [placed, 'CONFIRMED'],
        ] as const) {
          if (rows.length)
            await tx.order.updateMany({
              where: {
                id: { in: rows.map((o) => o.id) },
                status: status === 'CANCELLED' ? 'DRAFT' : 'PLACED',
              },
              data: { status, version: { increment: 1 } },
            });
        }
        const units = placed.flatMap((o) =>
          o.lines.flatMap((l) =>
            l.combinations.map((c) => ({
              combinationId: c.id,
              stationId: l.stationId,
              stationName: l.stationName,
            })),
          ),
        );
        if (units.length) await tx.prepUnit.createMany({ data: units, skipDuplicates: true });
        await this.drops.confirmBatch(
          tx,
          placed.map((order) => order.id),
        );
        if (pending.length)
          await tx.orderEvent.createMany({
            data: pending.map((o) => {
              const closure = closures.find(
                (c) => c.deliveryDate.getTime() === o.deliveryDate.getTime(),
              );
              return {
                orderId: o.id,
                type: cutoffStatus(o.status),
                description: closure ? 'Manual date closure processed' : 'Saved cutoff reached',
                actorId: closure?.actorId ?? null,
              };
            }),
          });
        return { confirmed: placed.length, cancelled: drafts.length };
      });
      confirmed += result.confirmed;
      cancelled += result.cancelled;
    }
    return { confirmed, cancelled };
  }

  async close(deliveryDate: string, user: SessionUser) {
    await this.transaction(async (tx) => {
      await tx.orderClosure.upsert({
        where: { deliveryDate: toDbDate(deliveryDate) },
        create: { deliveryDate: toDbDate(deliveryDate), actorId: user.id },
        update: {},
      });
    });
    return this.processDue();
  }
}
