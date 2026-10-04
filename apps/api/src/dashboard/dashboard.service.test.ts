import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_PERMISSIONS, type SessionUser } from '@fernleaf/shared';
import { DashboardService } from './dashboard.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OrdersService } from '../orders/orders.service.js';
import type { KitchenService } from '../kitchen/kitchen.service.js';
import type { SettingsService } from '../settings/settings.service.js';
import type { DemoService } from '../demo/demo.service.js';
function fixture() {
  const db = {
    order: {
      groupBy: vi.fn().mockResolvedValue([
        { status: 'CONFIRMED', _count: { _all: 3 } },
        { status: 'CANCELLED', _count: { _all: 2 } },
      ]),
      count: vi.fn().mockResolvedValue(2),
    },
    invoice: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { totalCents: 1234 }, _count: { _all: 2 } }),
      count: vi.fn().mockResolvedValue(1),
    },
    kitchenStation: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'hot', name: 'Hot' },
        { id: 'cold', name: 'Cold' },
      ]),
    },
    drop: {
      groupBy: vi.fn().mockResolvedValue([
        { status: 'WAITING', _count: { _all: 2 } },
        { status: 'OUT_FOR_DELIVERY', _count: { _all: 1 } },
        { status: 'DELIVERED', _count: { _all: 3 } },
      ]),
      count: vi.fn().mockResolvedValue(1),
    },
    $queryRaw: vi.fn().mockResolvedValue([
      { state: 'KITCHEN_READY', count: 2n },
      { state: 'OUT_FOR_DELIVERY', count: 1n },
    ]),
  };
  const orders = { processDue: vi.fn() },
    settings = {
      get: vi.fn().mockResolvedValue({ atRiskMinutes: 30, kitchenWorkingDays: [1, 2, 3, 4, 5] }),
      listHolidays: vi.fn().mockResolvedValue([]),
    },
    kitchen = {
      stationSummary: vi.fn().mockResolvedValue([
        { id: 'hot', name: 'Hot', total: 8, started: 2, done: 3, late: 1, atRisk: 2 },
        {
          id: 'retired',
          name: 'Historical station',
          total: 1,
          started: 0,
          done: 0,
          late: 1,
          atRisk: 0,
        },
      ]),
    };
  const service = new DashboardService(
    db as unknown as PrismaService,
    orders as unknown as OrdersService,
    kitchen as unknown as KitchenService,
    settings as unknown as SettingsService,
    { ensureCurrentWeek: vi.fn() } as unknown as DemoService,
  );
  return { db, orders, kitchen, settings, service };
}
const user = (permissions: SessionUser['permissions']) =>
  ({ id: 'own-driver', permissions }) as SessionUser;
describe('honest dashboard figures and scopes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T20:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());
  it('uses the kitchen date, fills missing status counts, and keeps all-date unpaid/review figures separate', async () => {
    const f = fixture(),
      result = await f.service.get(user(ALL_PERMISSIONS));
    expect(result).toMatchObject({
      kind: 'ADMIN',
      date: '2026-10-05',
      unpaidCents: 1234,
      unpaidInvoices: 2,
      reviewInvoices: 1,
      orders: { CONFIRMED: 3, CANCELLED: 2, DRAFT: 0 },
    });
    expect(f.db.order.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deliveryDate: new Date('2026-10-05') } }),
    );
    expect(f.db.invoice.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { paidAt: null } }),
    );
    expect(f.kitchen.stationSummary).not.toHaveBeenCalled();
  });
  it('empty unpaid totals become zero, not missing or NaN', async () => {
    const f = fixture();
    f.db.invoice.aggregate.mockResolvedValue({
      _sum: { totalCents: null as unknown as number },
      _count: { _all: 0 },
    });
    expect(await f.service.get(user(ALL_PERMISSIONS))).toMatchObject({
      unpaidCents: 0,
      unpaidInvoices: 0,
    });
  });
  it('kitchen includes idle active stations, historical work and Unassigned without querying finance', async () => {
    const f = fixture(),
      result = await f.service.get(user(['kitchen.view']));
    expect(result.kind).toBe('KITCHEN');
    if (result.kind !== 'KITCHEN') throw Error('Wrong kind');
    expect(result.stations.find((s) => s.id === 'cold')).toMatchObject({
      total: 0,
      done: 0,
      late: 0,
    });
    expect(result.stations.find((s) => s.id === null)?.name).toBe('Unassigned');
    expect(result.stations.find((s) => s.id === 'retired')?.total).toBe(1);
    expect(result.stations.reduce((n, s) => n + s.total - s.done, 0)).toBe(6);
    expect(f.kitchen.stationSummary).toHaveBeenCalledWith('2026-10-05', expect.any(Date), 30);
    expect(f.db.invoice.aggregate).not.toHaveBeenCalled();
  });
  it('dispatch counts full-date drops rather than a paginated sample of orders', async () => {
    const f = fixture(),
      result = await f.service.get(user(['dispatch.view']));
    expect(result).toMatchObject({
      kind: 'DISPATCH',
      drops: { KITCHEN_READY: 2, OUT_FOR_DELIVERY: 1, WAITING: 0 },
      unassigned: 1,
    });
    expect(f.db.order.groupBy).not.toHaveBeenCalled();
    expect(f.db.invoice.aggregate).not.toHaveBeenCalled();
  });
  it('driver scopes every query to their own drops today and separates missing timing', async () => {
    const f = fixture(),
      result = await f.service.get(user(['deliveries.own']));
    expect(result).toMatchObject({
      kind: 'DRIVER',
      remaining: 3,
      out: 1,
      delivered: 3,
      onTime: 1,
      late: 1,
      unknownOnTime: 1,
    });
    expect(f.db.drop.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          driverId: 'own-driver',
          deliveryDate: new Date('2026-10-05'),
          orders: { some: {} },
        },
      }),
    );
    for (const [call] of f.db.drop.count.mock.calls)
      expect(call).toMatchObject({
        where: { driverId: 'own-driver', deliveryDate: new Date('2026-10-05') },
      });
    expect(f.db.invoice.aggregate).not.toHaveBeenCalled();
    expect(f.db.$queryRaw).not.toHaveBeenCalled();
  });
  it('general custom roles do not receive operational or financial counts', async () => {
    const f = fixture();
    expect(await f.service.get(user(['catalogue.read']))).toMatchObject({ kind: 'GENERAL' });
    expect(f.db.order.groupBy).not.toHaveBeenCalled();
    expect(f.db.drop.groupBy).not.toHaveBeenCalled();
    expect(f.db.invoice.aggregate).not.toHaveBeenCalled();
  });
});
