import { Injectable } from '@nestjs/common';
import {
  dashboardKind,
  DROP_STATES,
  ORDER_STATUSES,
  kitchenToday,
  addDays,
  isKitchenWorkingDay,
  type Dashboard,
  type DropState,
  type KitchenStationSummary,
  type SessionUser,
} from '@fernleaf/shared';
import { toDbDate } from '../common/db-dates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { KitchenService } from '../kitchen/kitchen.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { DemoService } from '../demo/demo.service.js';
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly kitchen: KitchenService,
    private readonly settings: SettingsService,
    private readonly demo: DemoService,
  ) {}
  async get(user: SessionUser): Promise<Dashboard> {
    await this.demo.ensureCurrentWeek();
    await this.orders.processDue();
    const now = new Date(),
      date = kitchenToday(now),
      deliveryDate = toDbDate(date),
      base = {
        date,
        asOf: now.toISOString(),
        calendar: { workingDay: true, nextWorkingDate: null as string | null },
      },
      kind = dashboardKind(user.permissions);
    const [platform, holidays] = await Promise.all([
      this.settings.get(),
      this.settings.listHolidays(),
    ]);
    const calendar = { workingDays: platform.kitchenWorkingDays, holidays };
    base.calendar = {
      workingDay: isKitchenWorkingDay(date, calendar),
      nextWorkingDate: null as string | null,
    };
    for (let i = 1; i <= 366; i++) {
      const next = addDays(date, i);
      if (isKitchenWorkingDay(next, calendar)) {
        base.calendar.nextWorkingDate = next;
        break;
      }
    }
    if (kind === 'ADMIN') {
      const [groups, unpaid, reviewInvoices] = await Promise.all([
        this.prisma.order.groupBy({
          by: ['status'],
          where: { deliveryDate },
          _count: { _all: true },
        }),
        this.prisma.invoice.aggregate({
          where: { paidAt: null },
          _sum: { totalCents: true },
          _count: { _all: true },
        }),
        this.prisma.invoice.count({
          where: { orders: { some: { billingReviewReason: { not: '' } } } },
        }),
      ]);
      const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Extract<
        Dashboard,
        { kind: 'ADMIN' }
      >['orders'];
      for (const g of groups) counts[g.status] = g._count._all;
      return {
        ...base,
        kind,
        orders: counts,
        unpaidCents: unpaid._sum.totalCents ?? 0,
        unpaidInvoices: unpaid._count._all,
        reviewInvoices,
      };
    }
    if (kind === 'KITCHEN') {
      const settings = platform;
      const [work, stations, readyOrders] = await Promise.all([
        this.kitchen.stationSummary(date, now, settings.atRiskMinutes),
        this.prisma.kitchenStation.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.order.count({
          where: { deliveryDate, status: 'CONFIRMED', kitchenReadyAt: { not: null } },
        }),
      ]);
      const map = new Map<string | null, KitchenStationSummary>(work.map((s) => [s.id, s]));
      for (const s of stations)
        if (!map.has(s.id))
          map.set(s.id, { ...s, total: 0, started: 0, done: 0, late: 0, atRisk: 0 });
      if (!map.has(null))
        map.set(null, {
          id: null,
          name: 'Unassigned',
          total: 0,
          started: 0,
          done: 0,
          late: 0,
          atRisk: 0,
        });
      return {
        ...base,
        kind,
        stations: [...map.values()].sort((a, b) => a.name.localeCompare(b.name)),
        readyOrders,
        atRiskMinutes: settings.atRiskMinutes,
      };
    }
    if (kind === 'DISPATCH') {
      const [groups, unassigned] = await Promise.all([
        this.prisma.$queryRaw<{ state: DropState; count: bigint }[]>`
          SELECT CASE WHEN d.status='WAITING' AND NOT EXISTS
            (SELECT 1 FROM orders o WHERE o."dropId"=d.id AND (o.status<>'CONFIRMED' OR o."kitchenReadyAt" IS NULL))
            THEN 'KITCHEN_READY' ELSE d.status::text END AS state, COUNT(*) AS count
          FROM drops d WHERE d."deliveryDate"=${deliveryDate}
            AND EXISTS (SELECT 1 FROM orders o WHERE o."dropId"=d.id)
          GROUP BY state
        `,
        this.prisma.drop.count({
          where: {
            deliveryDate,
            driverId: null,
            status: { in: ['WAITING', 'DISPATCH_READY'] },
            orders: { some: {} },
          },
        }),
      ]);
      const drops = Object.fromEntries(DROP_STATES.map((s) => [s, 0])) as Record<DropState, number>;
      for (const g of groups) drops[g.state] = Number(g.count);
      return { ...base, kind, drops, unassigned };
    }
    if (kind === 'DRIVER') {
      const where = { driverId: user.id, deliveryDate, orders: { some: {} } };
      const [groups, onTime, late, unknownOnTime] = await Promise.all([
        this.prisma.drop.groupBy({ by: ['status'], where, _count: { _all: true } }),
        this.prisma.drop.count({ where: { ...where, status: 'DELIVERED', onTime: true } }),
        this.prisma.drop.count({ where: { ...where, status: 'DELIVERED', onTime: false } }),
        this.prisma.drop.count({ where: { ...where, status: 'DELIVERED', onTime: null } }),
      ]);
      const delivered = groups.find((g) => g.status === 'DELIVERED')?._count._all ?? 0,
        out = groups.find((g) => g.status === 'OUT_FOR_DELIVERY')?._count._all ?? 0;
      return {
        ...base,
        kind,
        remaining: groups
          .filter((g) => g.status !== 'DELIVERED')
          .reduce((n, g) => n + g._count._all, 0),
        delivered,
        out,
        onTime,
        late,
        unknownOnTime,
      };
    }
    return { ...base, kind };
  }
}
