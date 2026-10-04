import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KitchenQuery, SessionUser } from '@fernleaf/shared';
import { KitchenService, kitchenUnit } from './kitchen.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OrdersService } from '../orders/orders.service.js';
import type { SettingsService } from '../settings/settings.service.js';
const at = new Date('2026-10-05T06:00:00Z');
const actor = { id: 'actor' } as SessionUser;
function fixture() {
  const order = {
    id: 'order',
    sequence: 123,
    version: 3,
    status: 'CONFIRMED',
    kitchenStartedAt: null,
    kitchenReadyAt: null,
    employeeName: 'Employee',
    companyName: 'Company',
    packagingName: 'Box',
    notes: 'No sauce',
    deliveryTimeMinutes: 750,
    plannedKitchenReadyAt: at,
    plannedDispatchReadyAt: new Date(at.getTime() + 30 * 60000),
  };
  const unit = {
    id: 'unit',
    stationId: null,
    stationName: null,
    startedAt: null,
    doneAt: null,
    combination: {
      quantity: 4,
      options: [
        { id: 'option', name: 'Rice', groupName: 'Base', groupId: 'group', priceCents: 100 },
      ],
      line: { orderId: order.id, name: 'Bowl', sku: 'BWL', temperature: 'HOT' as const, order },
    },
  };
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    order: {
      findUnique: vi.fn().mockResolvedValue(order),
      update: vi.fn().mockResolvedValue(order),
    },
    prepUnit: {
      findUnique: vi.fn().mockResolvedValue(unit),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([unit]),
    },
    orderEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const orders = {
    transaction: async <T>(run: (tx: typeof db) => Promise<T>) => run(db),
    processDue: vi.fn().mockResolvedValue({ confirmed: 0, cancelled: 0 }),
  };
  const settings = { get: vi.fn().mockResolvedValue({ atRiskMinutes: 30 }) };
  const service = new KitchenService(
    db as unknown as PrismaService,
    orders as unknown as OrdersService,
    settings as unknown as SettingsService,
  );
  return { order, unit, db, service };
}
describe('kitchen transitions and board projection', () => {
  let f: ReturnType<typeof fixture>;
  beforeEach(() => {
    f = fixture();
  });
  it('locks the order, starts once, and records first kitchen start', async () => {
    await f.service.work('unit', 'start', actor);
    expect(f.db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(f.db.prepUnit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'unit', doneAt: null, startedAt: null },
        data: expect.objectContaining({ startedById: 'actor', startedAt: expect.any(Date) }),
      }),
    );
    expect(f.db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kitchenStartedAt: expect.any(Date),
          version: { increment: 1 },
        }),
      }),
    );
    expect(f.db.orderEvent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ type: 'KITCHEN_STARTED' }),
        expect.objectContaining({ type: 'UNIT_STARTED' }),
      ]),
    });
  });
  it('refuses a second start', async () => {
    Object.assign(f.unit, { startedAt: at });
    await expect(f.service.work('unit', 'start', actor)).rejects.toMatchObject({
      body: { code: 'UNIT_ALREADY_WORKED' },
    });
    expect(f.db.prepUnit.updateMany).not.toHaveBeenCalled();
  });
  it('finishes an unstarted last unit and records both start and readiness', async () => {
    await f.service.work('unit', 'done', actor);
    expect(f.db.prepUnit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          startedAt: expect.any(Date),
          doneAt: expect.any(Date),
          doneById: 'actor',
        }),
      }),
    );
    expect(f.db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kitchenReadyAt: expect.any(Date) }),
      }),
    );
    expect(f.db.orderEvent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ type: 'UNIT_STARTED' }),
        expect.objectContaining({ type: 'UNIT_DONE' }),
        expect.objectContaining({ type: 'KITCHEN_READY' }),
      ]),
    });
  });
  it('does not mark ready with an unfinished sibling or replace the first start', async () => {
    Object.assign(f.unit, { startedAt: at });
    Object.assign(f.order, { kitchenStartedAt: at });
    f.db.prepUnit.count.mockResolvedValue(1);
    await f.service.work('unit', 'done', actor);
    const data = f.db.order.update.mock.calls[0]![0].data;
    expect(data.kitchenStartedAt).toEqual(at);
    expect(data).not.toHaveProperty('kitchenReadyAt');
    expect(f.db.prepUnit.updateMany.mock.calls[0]![0].data).not.toHaveProperty('startedAt');
  });
  it('refuses a second finish', async () => {
    Object.assign(f.unit, { doneAt: at });
    await expect(f.service.work('unit', 'done', actor)).rejects.toMatchObject({
      body: { code: 'UNIT_ALREADY_WORKED' },
    });
  });
  it('rejects cancelled, draft, placed and delivered orders', async () => {
    for (const status of ['CANCELLED', 'DRAFT', 'PLACED', 'DELIVERED']) {
      f.order.status = status;
      await expect(f.service.work('unit', 'done', actor)).rejects.toMatchObject({
        body: { code: 'ORDER_NOT_CONFIRMED' },
      });
    }
    expect(f.db.prepUnit.updateMany).not.toHaveBeenCalled();
  });
  it('rejects missing units and conditional-write conflicts', async () => {
    f.db.prepUnit.findUnique.mockResolvedValueOnce(null);
    await expect(f.service.work('missing', 'start', actor)).rejects.toMatchObject({
      body: { code: 'NOT_FOUND' },
    });
    f.db.prepUnit.updateMany.mockResolvedValue({ count: 0 });
    await expect(f.service.work('unit', 'start', actor)).rejects.toMatchObject({
      body: { code: 'CONCURRENT_UPDATE' },
    });
  });
  it('force-completion starts only missing starts and finishes only remaining units', async () => {
    f.db.prepUnit.count.mockResolvedValue(2);
    await f.service.forceComplete('order', 3, 'Test', actor);
    expect(f.db.prepUnit.updateMany.mock.calls[0]![0].where).toHaveProperty('startedAt', null);
    expect(f.db.prepUnit.updateMany.mock.calls[1]![0].where).toHaveProperty('doneAt', null);
    expect(f.db.orderEvent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          type: 'KITCHEN_FORCE_COMPLETED',
          description: expect.stringContaining('Test'),
        }),
      ]),
    });
  });
  it('rejects stale, already-ready and empty force completions', async () => {
    await expect(f.service.forceComplete('order', 2, '', actor)).rejects.toMatchObject({
      body: { code: 'CONCURRENT_UPDATE' },
    });
    Object.assign(f.order, { kitchenReadyAt: at });
    await expect(f.service.forceComplete('order', 3, '', actor)).rejects.toMatchObject({
      body: { code: 'KITCHEN_ALREADY_READY' },
    });
    Object.assign(f.order, { kitchenReadyAt: null });
    await expect(f.service.forceComplete('order', 3, '', actor)).rejects.toMatchObject({
      body: { code: 'NO_PREP_UNITS' },
    });
  });
  it('projects snapshot quantities and choices without any money', () => {
    const visible = kitchenUnit(f.unit, at, 30);
    expect(visible.stationName).toBe('Unassigned');
    expect(visible.quantity).toBe(4);
    expect(visible.choices).toEqual([{ name: 'Rice', groupName: 'Base' }]);
    expect(JSON.stringify(visible)).not.toContain('Cents');
  });
  it('bounds cards, filters confirmed orders, and aggregates all-date summaries', async () => {
    f.db.prepUnit.count.mockResolvedValue(400);
    f.db.$queryRaw.mockResolvedValue([
      { id: null, name: 'Unassigned', total: 400n, started: 10n, done: 20n, late: 5n, atRisk: 6n },
    ]);
    const board = await f.service.board({
      deliveryDate: '2026-10-05',
      page: 2,
      pageSize: 80,
      state: 'open',
      stationId: 'unassigned',
    } as KitchenQuery);
    expect(f.db.prepUnit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 80,
        skip: 80,
        where: expect.objectContaining({
          stationId: null,
          doneAt: null,
          combination: {
            line: { order: { deliveryDate: new Date('2026-10-05'), status: 'CONFIRMED' } },
          },
        }),
      }),
    );
    expect(board.units.total).toBe(400);
    expect(board.stations[0]!.total).toBe(400);
    expect(JSON.stringify(board)).not.toContain('Cents');
  });
});
