import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type MenuDish } from '@fernleaf/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { MenuService } from '../menu/menu.service.js';
import type { SettingsService } from '../settings/settings.service.js';
import { boardExampleLines, BOARD_DEMO_PREFIX, seedBoardExamples } from './board-examples.js';

const now = new Date('2026-10-04T08:00:00Z');
const dish: MenuDish = {
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
} as MenuDish;
function fixture() {
  const companies = [0, 1, 2].map((i) => ({
    id: 'company-' + i,
    name: 'Company ' + i,
    employees: [0, 1, 2, 3].map((e) => ({ id: `employee-${i}-${e}`, name: 'Employee ' + e })),
    addresses: [
      {
        id: 'address-' + i,
        label: 'HQ',
        line1: 'Street',
        line2: '',
        city: 'City',
        postcode: '123',
        deliveryNotes: '',
      },
    ],
    workingDays: [1, 2, 3, 4, 5],
    holidays: [] as { startDate: Date; endDate: Date }[],
    defaultPackagingType: { isActive: true, name: 'Box' },
    defaultPackagingTypeId: 'box',
    defaultDeliveryTimeMinutes: 750,
    dispatchLeadMinutes: 60,
    driverInstructions: 'Reception',
    defaultDriverId: 'driver',
  }));
  const orders: Prisma.OrderCreateManyInput[] = [],
    drops: Prisma.DropCreateManyInput[] = [],
    events: Prisma.OrderEventCreateManyInput[] = [];
  const db = {
    company: { findMany: vi.fn().mockResolvedValue(companies) },
    user: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'driver', email: 'driver@test.com', role: { permissions: ['deliveries.own'] } },
        { id: 'cook', email: 'kitchen@test.com', role: { permissions: ['kitchen.work'] } },
      ]),
    },
    dish: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 'dish', stationId: 'station', station: { name: 'Curry' } }]),
    },
    orderClosure: { findUnique: vi.fn().mockResolvedValue(null) },
    order: {
      findMany: vi.fn().mockImplementation(({ where }) =>
        orders
          .filter((o) => String(o.deliveryDate) === String(where.deliveryDate))
          .map((o) => ({
            ...o,
            events: events.filter(
              (e) =>
                e.orderId === o.id &&
                e.type === 'CREATED' &&
                e.description?.startsWith(BOARD_DEMO_PREFIX),
            ),
          })),
      ),
      createMany: vi.fn().mockImplementation(({ data }) => orders.push(...data)),
    },
    drop: {
      findMany: vi
        .fn()
        .mockImplementation(({ where }) =>
          drops.filter((d) => String(d.deliveryDate) === String(where.deliveryDate)),
        ),
      createMany: vi.fn().mockImplementation(({ data }) => drops.push(...data)),
    },
    orderLine: { createMany: vi.fn() },
    orderCombination: { createMany: vi.fn() },
    prepUnit: { createMany: vi.fn() },
    orderEvent: { createMany: vi.fn().mockImplementation(({ data }) => events.push(...data)) },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(async (run) => run(db));
  const menus = { forEmployee: vi.fn().mockResolvedValue({ categories: [{ dishes: [dish] }] }) };
  const settings = {
    get: vi.fn().mockResolvedValue(DEFAULT_SETTINGS),
    listHolidays: vi.fn().mockResolvedValue([]),
  };
  const run = () =>
    seedBoardExamples(
      db as unknown as PrismaService,
      menus as unknown as MenuService,
      settings as unknown as SettingsService,
      now,
    );
  return { db, companies, orders, drops, events, menus, settings, run };
}
describe('explicit early-confirmed demo board fixtures', () => {
  it('snapshots priced choices and MOQ once per available station', () => {
    const result = boardExampleLines(
      [dish, { ...dish, dishId: 'other', menuItemId: 'other-menu' }],
      [
        { id: 'dish', stationId: 'station', station: { name: 'Curry' } },
        { id: 'other', stationId: 'station', station: { name: 'Curry' } },
      ],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      quantity: 2,
      totalCents: 522,
      stationId: 'station',
      stationName: 'Curry',
    });
    expect(result[0]!.combinations[0]!.options[0]!.id).toBe('tofu');
  });
  it('adds three confirmed orders and assigned drops on every working date, with three prep stages', async () => {
    const f = fixture();
    const result = await f.run();
    expect(result.created).toBe(30);
    expect(result.coverage).toHaveLength(10);
    expect(result.coverage.every((d) => d.created === 3)).toBe(true);
    expect(result.coverage[0]!.date).toBe('2026-10-05');
    expect(result.coverage.at(-1)!.date).toBe('2026-10-16');
    expect(
      f.orders.every((o) => o.status === 'CONFIRMED' && o.notes?.startsWith(BOARD_DEMO_PREFIX)),
    ).toBe(true);
    expect(f.drops.every((d) => d.driverId === 'driver' && d.status === 'WAITING')).toBe(true);
    expect(f.db.prepUnit.createMany.mock.calls[0]![0].data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ startedAt: null, doneAt: null }),
        expect.objectContaining({ startedAt: expect.any(Date), doneAt: null }),
        expect.objectContaining({ startedAt: expect.any(Date), doneAt: expect.any(Date) }),
      ]),
    );
    expect(
      f.events
        .filter((e) => e.type === 'CONFIRMED')
        .every((e) => e.description?.includes('not automatic cutoff')),
    ).toBe(true);
  });
  it('reruns without duplicating or restoring cancelled examples, even when notes were edited', async () => {
    const f = fixture();
    await f.run();
    f.orders[0]!.status = 'CANCELLED';
    f.orders[0]!.notes = 'Staff edited notes';
    const before = JSON.stringify([f.orders, f.drops, f.events]);
    expect((await f.run()).created).toBe(0);
    expect(JSON.stringify([f.orders, f.drops, f.events])).toBe(before);
  });
  it('uses another employee and time instead of changing existing orders or drop groups', async () => {
    const f = fixture();
    const existing = {
      id: 'existing-order',
      employeeId: 'employee-0-2',
      companyId: 'company-0',
      addressId: 'address-0',
      deliveryDate: new Date('2026-10-05'),
      deliveryTimeMinutes: 750,
      notes: 'User order',
    } as Prisma.OrderCreateManyInput;
    const drop = {
      id: 'existing-drop',
      companyId: 'company-0',
      addressId: 'address-0',
      deliveryDate: new Date('2026-10-05'),
      deliveryTimeMinutes: 735,
      status: 'DISPATCH_READY',
    } as Prisma.DropCreateManyInput;
    f.orders.push(existing);
    f.drops.push(drop);
    const before = JSON.stringify([existing, drop]);
    await f.run();
    const added = f.orders.find(
      (o) =>
        o.companyId === 'company-0' &&
        o.id !== existing.id &&
        String(o.deliveryDate) === String(existing.deliveryDate),
    );
    expect(added).toMatchObject({ employeeId: 'employee-0-3', deliveryTimeMinutes: 765 });
    expect(JSON.stringify([existing, drop])).toBe(before);
  });
  it('respects kitchen holidays, company holidays and manually closed dates', async () => {
    const f = fixture();
    f.settings.listHolidays.mockResolvedValue([{ startDate: '2026-10-06', endDate: '2026-10-06' }]);
    f.companies[0]!.holidays = [
      { startDate: new Date('2026-10-07'), endDate: new Date('2026-10-07') },
    ];
    f.db.orderClosure.findUnique.mockImplementation(async ({ where }) =>
      String(where.deliveryDate) === String(new Date('2026-10-05'))
        ? { deliveryDate: where.deliveryDate }
        : null,
    );
    expect((await f.run()).created).toBe(23);
    expect(
      f.orders.some((o) =>
        ['2026-10-05', '2026-10-06'].includes((o.deliveryDate as Date).toISOString().slice(0, 10)),
      ),
    ).toBe(false);
  });
  it('skips absent active drivers instead of creating unusable drops', async () => {
    const f = fixture();
    f.db.user.findMany.mockResolvedValue([]);
    expect((await f.run()).created).toBe(0);
    expect(f.db.order.createMany).not.toHaveBeenCalled();
  });
  it('skips companies without an available employee and leaves their records untouched', async () => {
    const f = fixture();
    for (const c of f.companies) c.employees = c.employees.slice(0, 2);
    expect((await f.run()).created).toBe(0);
    expect(f.db.drop.createMany).not.toHaveBeenCalled();
  });
  it('retries serialization races with the full date transaction', async () => {
    const f = fixture();
    f.db.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    expect((await f.run()).created).toBe(30);
    expect(f.db.$transaction).toHaveBeenCalledTimes(11);
  });
});
