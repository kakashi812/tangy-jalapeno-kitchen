import { HttpStatus, Injectable } from '@nestjs/common';
import {
  kitchenToday,
  kitchenUrgency,
  orderNumber,
  pageOffset,
  type KitchenBoard,
  type KitchenQuery,
  type KitchenUnit,
  type SavedChoice,
  type SessionUser,
} from '@fernleaf/shared';
import { ApiException } from '../common/api-exception.js';
import { toDbDate } from '../common/db-dates.js';
import { Prisma, type Order } from '../generated/prisma/client.js';
import { OrdersService } from '../orders/orders.service.js';
import { requireVersion } from '../orders/orders.policy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';

const UNIT_SELECT = {
  id: true,
  stationId: true,
  stationName: true,
  startedAt: true,
  doneAt: true,
  combination: {
    select: {
      quantity: true,
      options: true,
      line: {
        select: {
          name: true,
          sku: true,
          temperature: true,
          order: {
            select: {
              id: true,
              sequence: true,
              version: true,
              employeeName: true,
              companyName: true,
              packagingName: true,
              notes: true,
              deliveryTimeMinutes: true,
              plannedKitchenReadyAt: true,
              plannedDispatchReadyAt: true,
            },
          },
        },
      },
    },
  },
} as const satisfies Prisma.PrepUnitSelect;
type UnitRow = Prisma.PrepUnitGetPayload<{ select: typeof UNIT_SELECT }>;
type StationStats = {
  id: string | null;
  name: string;
  total: bigint;
  started: bigint;
  done: bigint;
  late: bigint;
  atRisk: bigint;
};

/** Explicit public projection: snapshot option prices must never enter the kitchen response. */
export function kitchenUnit(row: UnitRow, now: Date, atRiskMinutes: number): KitchenUnit {
  const line = row.combination.line,
    order = line.order;
  return {
    id: row.id,
    stationId: row.stationId,
    stationName: row.stationName ?? 'Unassigned',
    dishName: line.name,
    sku: line.sku,
    temperature: line.temperature,
    quantity: row.combination.quantity,
    choices: (row.combination.options as SavedChoice[]).map((o) => ({
      name: o.name,
      groupName: o.groupName,
    })),
    orderId: order.id,
    orderNumber: orderNumber(order.sequence),
    orderVersion: order.version,
    employeeName: order.employeeName,
    companyName: order.companyName,
    packagingName: order.packagingName,
    notes: order.notes,
    deliveryTimeMinutes: order.deliveryTimeMinutes,
    plannedKitchenReadyAt: order.plannedKitchenReadyAt.toISOString(),
    plannedDispatchReadyAt: order.plannedDispatchReadyAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    doneAt: row.doneAt?.toISOString() ?? null,
    urgency: kitchenUrgency(
      order.plannedKitchenReadyAt,
      row.startedAt,
      row.doneAt,
      now,
      atRiskMinutes,
    ),
  };
}

@Injectable()
export class KitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly settings: SettingsService,
  ) {}

  async board(query: KitchenQuery): Promise<KitchenBoard> {
    await this.orders.processDue();
    const date = query.deliveryDate ?? kitchenToday(),
      settings = await this.settings.get(),
      now = new Date();
    const where: Prisma.PrepUnitWhereInput = {
      combination: { line: { order: { deliveryDate: toDbDate(date), status: 'CONFIRMED' } } },
      ...(query.stationId && {
        stationId: query.stationId === 'unassigned' ? null : query.stationId,
      }),
      ...(query.state === 'open'
        ? { doneAt: null }
        : query.state === 'done'
          ? { doneAt: { not: null } }
          : {}),
    };
    // All-station summaries are aggregated in Postgres; only a bounded page of cards is fetched.
    const [rows, total, stats] = await Promise.all([
      this.prisma.prepUnit.findMany({
        where,
        select: UNIT_SELECT,
        skip: pageOffset(query),
        take: query.pageSize,
        orderBy: [
          { combination: { line: { order: { plannedKitchenReadyAt: 'asc' } } } },
          { id: 'asc' },
        ],
      }),
      this.prisma.prepUnit.count({ where }),
      this.stationSummary(date, now, settings.atRiskMinutes),
    ]);
    return {
      deliveryDate: date,
      asOf: now.toISOString(),
      atRiskMinutes: settings.atRiskMinutes,
      stations: stats,
      units: {
        items: rows.map((r) => kitchenUnit(r, now, settings.atRiskMinutes)),
        total,
        page: query.page,
        pageSize: query.pageSize,
      },
    };
  }

  /** Shared full-date aggregation; dashboards do not fetch prep cards just to count work. */
  async stationSummary(date: string, now: Date, atRiskMinutes: number) {
    const stats = await this.prisma.$queryRaw<StationStats[]>`
        SELECT p."stationId" AS id, COALESCE(MAX(p."stationName"), 'Unassigned') AS name,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE p."startedAt" IS NOT NULL AND p."doneAt" IS NULL) AS started,
          COUNT(*) FILTER (WHERE p."doneAt" IS NOT NULL) AS done,
          COUNT(*) FILTER (WHERE p."doneAt" IS NULL AND o."plannedKitchenReadyAt" < ${now}) AS late,
          COUNT(*) FILTER (WHERE p."doneAt" IS NULL AND p."startedAt" IS NULL
            AND o."plannedKitchenReadyAt" >= ${now}
            AND o."plannedKitchenReadyAt" <= ${new Date(now.getTime() + atRiskMinutes * 60_000)}) AS "atRisk"
        FROM prep_units p JOIN order_combinations c ON c.id=p."combinationId"
        JOIN order_lines l ON l.id=c."lineId" JOIN orders o ON o.id=l."orderId"
        WHERE o.status='CONFIRMED' AND o."deliveryDate"=${toDbDate(date)}
        GROUP BY p."stationId" ORDER BY name ASC
      `;
    return stats.map((s) => ({
      id: s.id,
      name: s.name,
      total: Number(s.total),
      started: Number(s.started),
      done: Number(s.done),
      late: Number(s.late),
      atRisk: Number(s.atRisk),
    }));
  }

  private async lockOrder(tx: Prisma.TransactionClient, id: string): Promise<Order> {
    // Serialize sibling-unit completion, force completion and concurrent order mutations.
    await tx.$queryRaw`SELECT id FROM orders WHERE id=${id}::uuid FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id } });
    if (!order) throw ApiException.notFound('Order');
    if (order.status !== 'CONFIRMED')
      throw new ApiException(
        HttpStatus.CONFLICT,
        'ORDER_NOT_CONFIRMED',
        'Only confirmed orders can be worked',
      );
    return order;
  }

  async work(id: string, action: 'start' | 'done', user: SessionUser) {
    const lookup = await this.prisma.prepUnit.findUnique({
      where: { id },
      select: { combination: { select: { line: { select: { orderId: true } } } } },
    });
    if (!lookup) throw ApiException.notFound('Prep unit');
    const orderId = lookup.combination.line.orderId;
    await this.orders.transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      const unit = await tx.prepUnit.findUnique({ where: { id }, select: UNIT_SELECT });
      if (!unit) throw ApiException.notFound('Prep unit');
      if (unit.doneAt || (action === 'start' && unit.startedAt))
        throw new ApiException(
          HttpStatus.CONFLICT,
          'UNIT_ALREADY_WORKED',
          `This unit is already ${unit.doneAt ? 'done' : 'started'}. Refresh the board.`,
        );
      const at = new Date();
      const updated = await tx.prepUnit.updateMany({
        where: { id, doneAt: null, ...(action === 'start' ? { startedAt: null } : {}) },
        data: {
          ...(!unit.startedAt && { startedAt: at, startedById: user.id }),
          ...(action === 'done' && { doneAt: at, doneById: user.id }),
        },
      });
      if (updated.count !== 1)
        throw new ApiException(
          HttpStatus.CONFLICT,
          'CONCURRENT_UPDATE',
          'This unit changed. Refresh the board.',
        );
      const ready =
        action === 'done' &&
        (await tx.prepUnit.count({
          where: { doneAt: null, combination: { line: { orderId } } },
        })) === 0;
      await tx.order.update({
        where: { id: orderId },
        data: {
          kitchenStartedAt: order.kitchenStartedAt ?? at,
          ...(ready && { kitchenReadyAt: at }),
          version: { increment: 1 },
        },
      });
      const description = `${unit.combination.quantity} × ${unit.combination.line.name}`;
      const events: Prisma.OrderEventCreateManyInput[] = [];
      if (!order.kitchenStartedAt)
        events.push({
          orderId,
          type: 'KITCHEN_STARTED',
          description: 'First prep unit started',
          actorId: user.id,
        });
      if (!unit.startedAt)
        events.push({ orderId, type: 'UNIT_STARTED', description, actorId: user.id });
      if (action === 'done')
        events.push({ orderId, type: 'UNIT_DONE', description, actorId: user.id });
      if (ready)
        events.push({
          orderId,
          type: 'KITCHEN_READY',
          description: 'All prep units completed',
          actorId: user.id,
        });
      await tx.orderEvent.createMany({ data: events });
    });
    return { id };
  }

  async forceComplete(id: string, version: number, reason: string, user: SessionUser) {
    await this.orders.transaction(async (tx) => {
      const order = await this.lockOrder(tx, id);
      requireVersion(order.version, version);
      if (order.kitchenReadyAt)
        throw new ApiException(
          HttpStatus.CONFLICT,
          'KITCHEN_ALREADY_READY',
          'This order is already kitchen-ready',
        );
      const where: Prisma.PrepUnitWhereInput = { combination: { line: { orderId: id } } };
      if (!(await tx.prepUnit.count({ where })))
        throw new ApiException(
          HttpStatus.CONFLICT,
          'NO_PREP_UNITS',
          'This order has no prep units',
        );
      const at = new Date();
      await tx.prepUnit.updateMany({
        where: { ...where, startedAt: null },
        data: { startedAt: at, startedById: user.id },
      });
      await tx.prepUnit.updateMany({
        where: { ...where, doneAt: null },
        data: { doneAt: at, doneById: user.id },
      });
      await tx.order.update({
        where: { id },
        data: {
          kitchenStartedAt: order.kitchenStartedAt ?? at,
          kitchenReadyAt: at,
          version: { increment: 1 },
        },
      });
      await tx.orderEvent.createMany({
        data: [
          ...(!order.kitchenStartedAt
            ? [
                {
                  orderId: id,
                  type: 'KITCHEN_STARTED',
                  description: 'Started by admin force-completion',
                  actorId: user.id,
                },
              ]
            : []),
          {
            orderId: id,
            type: 'KITCHEN_FORCE_COMPLETED',
            description: `Admin completed all remaining units${reason ? `: ${reason}` : ''}`,
            actorId: user.id,
          },
          {
            orderId: id,
            type: 'KITCHEN_READY',
            description: 'All prep units completed',
            actorId: user.id,
          },
        ],
      });
    });
    return { id };
  }
}
