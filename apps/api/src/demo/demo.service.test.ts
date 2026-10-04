import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@fernleaf/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { MenuService } from '../menu/menu.service.js';
import type { SettingsService } from '../settings/settings.service.js';
import { DemoService } from './demo.service.js';
const now = new Date('2026-10-05T06:00:00Z'),
  start = '2026-10-05';
function fixture() {
  const company = {
    id: 'company',
    name: 'Company',
    employees: [{ id: 'employee', name: 'Employee' }],
    addresses: [
      {
        id: 'address',
        label: 'HQ',
        line1: 'Street',
        line2: '',
        city: 'City',
        postcode: '123',
        deliveryNotes: '',
      },
    ],
    holidays: [] as { startDate: Date; endDate: Date }[],
    defaultPackagingType: { isActive: true, name: 'Box' },
    defaultPackagingTypeId: 'box',
    defaultDriverId: 'driver',
    defaultDeliveryTimeMinutes: 750,
    dispatchLeadMinutes: 60,
    workingDays: [1, 2, 3, 4, 5],
    driverInstructions: 'Reception',
    billingContactName: 'Contact',
    billingEmail: 'billing@company.example',
  };
  const db = {
    demoWeek: {
      findUnique: vi.fn().mockResolvedValue(null),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn(),
    },
    company: { findMany: vi.fn().mockResolvedValue([company]) },
    user: { findMany: vi.fn().mockResolvedValue([{ id: 'driver', email: 'driver@test.com' }]) },
    dish: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 'dish', stationId: 'station', station: { name: 'Curry' } }]),
    },
    order: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi
        .fn<(input: { data: Prisma.OrderCreateManyInput[] }) => Promise<unknown>>()
        .mockResolvedValue({ count: 5 }),
    },
    drop: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn() },
    invoice: { createMany: vi.fn() },
    orderLine: { createMany: vi.fn() },
    orderCombination: { createMany: vi.fn() },
    prepUnit: { createMany: vi.fn() },
    orderEvent: { createMany: vi.fn() },
    orderClosure: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(async (run: (tx: typeof db) => Promise<unknown>) => run(db));
  const menus = {
    forEmployee: vi.fn().mockResolvedValue({
      categories: [
        {
          name: 'Bowls',
          dishes: [
            {
              menuItemId: 'menu',
              dishId: 'dish',
              name: 'Bowl',
              sku: 'BWL',
              temperature: 'HOT',
              priceCents: 211,
              minOrderQty: 2,
              groups: [
                {
                  id: 'group',
                  name: 'Protein',
                  minSelect: 1,
                  maxSelect: 1,
                  options: [{ id: 'tofu', name: 'Tofu', priceCents: 50 }],
                },
              ],
            },
          ],
        },
      ],
    }),
  };
  const settings = {
    get: vi.fn().mockResolvedValue(DEFAULT_SETTINGS),
    listHolidays: vi.fn().mockResolvedValue([]),
  };
  const service = new DemoService(
    db as unknown as PrismaService,
    menus as unknown as MenuService,
    settings as unknown as SettingsService,
  );
  return { db, menus, settings, service, company };
}
describe('non-destructive week generation', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('does nothing for covered weeks and caches the successful coverage lookup', async () => {
    const f = fixture();
    f.db.demoWeek.findUnique.mockResolvedValue({ startDate: new Date(start) });
    expect(await f.service.ensureWeek(start, now)).toEqual({ created: 0 });
    await f.service.ensureWeek(start, now);
    expect(f.db.demoWeek.findUnique).toHaveBeenCalledOnce();
    expect(f.db.$transaction).not.toHaveBeenCalled();
    expect(f.menus.forEmployee).not.toHaveBeenCalled();
  });
  it('does not mutate or even inspect DB when automatic demo generation is disabled', async () => {
    const f = fixture();
    vi.stubEnv('DEMO_DATA_ENABLED', 'false');
    expect(await f.service.ensureCurrentWeek(now)).toEqual({ created: 0 });
    expect(f.db.demoWeek.findUnique).not.toHaveBeenCalled();
  });
  it('creates one valid working week with required selections, MOQ, snapshots and default driver', async () => {
    const f = fixture();
    expect(await f.service.ensureWeek(start, now)).toEqual({ created: 5 });
    const rows = f.db.order.createMany.mock.calls[0]![0].data;
    expect(rows).toHaveLength(5);
    expect(rows.every((o) => o.notes?.startsWith('[Demo]'))).toBe(true);
    expect(rows.every((o) => o.totalCents >= 522)).toBe(true);
    expect(
      rows.find(
        (o) => o.deliveryDate instanceof Date && o.deliveryDate.toISOString().startsWith(start),
      )?.status,
    ).toBe('CONFIRMED');
    expect(f.db.drop.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ driverId: 'driver', status: 'OUT_FOR_DELIVERY' }),
      ]),
    });
    expect(f.db.demoWeek.update).toHaveBeenCalledWith({
      where: { startDate: new Date(start) },
      data: { orderCount: 5 },
    });
  });
  it('checks the transactional claim before writing any rows', async () => {
    const f = fixture();
    f.db.demoWeek.createMany.mockResolvedValue({ count: 0 });
    expect(await f.service.ensureWeek(start, now)).toEqual({ created: 0 });
    expect(f.db.order.createMany).not.toHaveBeenCalled();
    expect(f.db.drop.createMany).not.toHaveBeenCalled();
  });
  it('skips existing employee/date orders and all existing drop groups, preserving staff edits', async () => {
    const f = fixture();
    f.db.order.findMany.mockResolvedValue([
      { employeeId: 'employee', deliveryDate: new Date('2026-10-05') },
    ]);
    f.db.drop.findMany.mockResolvedValue([
      {
        companyId: 'company',
        addressId: 'address',
        deliveryDate: new Date('2026-10-06'),
        deliveryTimeMinutes: 750,
      },
    ]);
    expect(await f.service.ensureWeek(start, now)).toEqual({ created: 3 });
    const rows = f.db.order.createMany.mock.calls[0]![0].data;
    expect(
      rows.some((o) =>
        ['2026-10-05', '2026-10-06'].includes((o.deliveryDate as Date).toISOString().slice(0, 10)),
      ),
    ).toBe(false);
  });
  it('respects company and kitchen holidays without changing calendars', async () => {
    const f = fixture();
    f.company.holidays = [{ startDate: new Date('2026-10-06'), endDate: new Date('2026-10-06') }];
    f.settings.listHolidays.mockResolvedValue([{ startDate: '2026-10-07', endDate: '2026-10-07' }]);
    expect(await f.service.ensureWeek(start, now)).toEqual({ created: 3 });
  });
  it('rolls back failed work without caching false coverage, so later access can retry', async () => {
    const f = fixture();
    f.db.$transaction.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(f.service.ensureWeek(start, now)).rejects.toThrow('Database unavailable');
    expect(await f.service.ensureWeek(start, now)).toEqual({ created: 5 });
    expect(f.db.demoWeek.findUnique).toHaveBeenCalledTimes(2);
  });
  it('never repopulates a delivery date that staff have manually closed', async () => {
    const f = fixture();
    f.db.orderClosure.findMany.mockResolvedValue([{ deliveryDate: new Date(start) }]);
    expect(await f.service.ensureWeek(start, now)).toEqual({ created: 4 });
    expect(
      f.db.order.createMany.mock.calls[0]![0].data.some((o) =>
        (o.deliveryDate as Date).toISOString().startsWith(start),
      ),
    ).toBe(false);
  });
  it('retries serialization/unique races and accepts an already committed winner', async () => {
    const f = fixture();
    f.db.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    f.db.demoWeek.createMany.mockResolvedValue({ count: 0 });
    expect(await f.service.ensureWeek(start, now)).toEqual({ created: 0 });
    expect(f.db.$transaction).toHaveBeenCalledTimes(2);
  });
  it('does not mark an unseeded empty database covered', async () => {
    const f = fixture();
    f.db.company.findMany.mockResolvedValue([]);
    expect(await f.service.ensureWeek(start, now)).toEqual({ created: 0 });
    expect(f.db.demoWeek.createMany).not.toHaveBeenCalled();
  });
});
