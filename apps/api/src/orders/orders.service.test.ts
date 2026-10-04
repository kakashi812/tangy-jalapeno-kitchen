import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALL_PERMISSIONS,
  DEFAULT_SETTINGS,
  OrderInputSchema,
  snapshotLine,
  type EmployeeMenu,
  type MenuDish,
  type OrderInput,
  type SessionUser,
} from '@fernleaf/shared';
import { OrdersService, savedLine, visibleLine } from './orders.service.js';
import type { MenuService } from '../menu/menu.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { SettingsService } from '../settings/settings.service.js';
import { Prisma } from '../generated/prisma/client.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const admin: SessionUser = {
  id: id(90),
  name: 'Admin',
  email: 'admin@test.com',
  role: { id: id(91), name: 'Admin' },
  permissions: ALL_PERMISSIONS,
};
const dish: MenuDish = {
  menuItemId: id(1),
  dishId: id(2),
  name: 'Bowl',
  description: '',
  sku: 'BWL',
  imageUrl: null,
  temperature: 'HOT',
  minOrderQty: null,
  priceCents: 800,
  allergens: [],
  dietaryTags: [],
  allergyConflicts: [],
  fitsDiet: null,
  groups: [
    {
      id: id(3),
      name: 'Rice',
      minSelect: 1,
      maxSelect: 1,
      options: [{ id: id(4), name: 'Rice', priceCents: 50, allergens: [], allergyConflicts: [] }],
    },
  ],
};
const menu: EmployeeMenu = {
  employee: { id: id(10), name: 'Priya', allergies: [], dietaryPreferences: [] },
  company: { id: id(11), name: 'Company' },
  tier: { id: id(12), name: 'Standard' },
  categories: [{ id: id(13), name: 'Bowls', isSecret: false, dishes: [dish] }],
  unlockedCategory: null,
};
const body = (extra: Partial<OrderInput> = {}): OrderInput =>
  OrderInputSchema.parse({
    employeeId: id(10),
    deliveryDate: '2099-01-07',
    addressId: id(20),
    deliveryTimeMinutes: 720,
    packagingTypeId: id(21),
    notes: '',
    intent: 'place',
    lines: [
      { menuItemId: id(1), quantity: 2, combinations: [{ quantity: 2, optionIds: [id(4)] }] },
    ],
    ...extra,
  });
function savedRow() {
  const snapshot = snapshotLine(body().lines[0]!, dish, 0, true);
  return {
    ...snapshot,
    id: id(30),
    orderId: id(100),
    sortOrder: 0,
    combinations: snapshot.combinations.map((c, i) => ({
      ...c,
      id: id(40 + i),
      lineId: id(30),
      sortOrder: i,
    })),
  };
}
function orderRow() {
  return {
    id: id(100),
    sequence: 123,
    employeeId: id(10),
    employeeName: 'Priya',
    companyId: id(11),
    companyName: 'Company',
    deliveryDate: new Date('2099-01-07T00:00:00Z'),
    deliveryTimeMinutes: 720,
    addressId: id(20),
    addressText: 'Saved address',
    packagingTypeId: id(21),
    packagingName: 'Box',
    notes: '',
    driverInstructions: 'Reception',
    dispatchLeadMinutes: 60,
    kitchenBufferMinutes: 30,
    plannedDispatchReadyAt: new Date('2099-01-07T05:30:00Z'),
    plannedKitchenReadyAt: new Date('2099-01-07T05:00:00Z'),
    cutoffAt: new Date('2099-01-01T10:30:00Z'),
    status: 'DRAFT' as const,
    totalCents: 1700,
    invoiceId: null,
    version: 0,
    kitchenStartedAt: null,
    kitchenReadyAt: null,
    outForDeliveryAt: null,
    lines: [savedRow()],
    events: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
function setup(skipDue = true) {
  const company = {
    id: id(11),
    name: 'Company',
    isActive: true,
    workingDays: [0, 1, 2, 3, 4, 5, 6],
    holidays: [],
    addresses: [
      {
        id: id(20),
        label: 'HQ',
        line1: 'Street',
        line2: '',
        city: 'City',
        postcode: '123',
        deliveryNotes: '',
        isDefault: true,
      },
    ],
    defaultDeliveryTimeMinutes: 720,
    defaultPackagingTypeId: id(21),
    dispatchLeadMinutes: 60,
    driverInstructions: 'Reception',
    billingEmail: 'private@example.com',
  };
  const fake = {
    employee: {
      findUnique: vi.fn().mockResolvedValue({
        id: id(10),
        companyId: id(11),
        name: 'Priya',
        company,
        canChooseAddress: false,
        canChangeDeliveryTime: false,
        canChangePackaging: false,
      }),
    },
    packagingType: {
      findMany: vi.fn().mockResolvedValue([{ id: id(21), name: 'Box' }]),
      findUnique: vi.fn().mockResolvedValue({ id: id(21), name: 'Box', isActive: true }),
    },
    orderClosure: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
    },
    order: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(orderRow()),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ ...orderRow(), ...data, id: id(100) })),
    },
    dish: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: id(2), stationId: id(50), station: { name: 'Curry' } }]),
    },
    orderLine: {
      findMany: vi.fn().mockResolvedValue([savedRow()]),
      deleteMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    prepUnit: { createMany: vi.fn() },
    orderEvent: { create: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
  };
  fake.$transaction.mockImplementation((run) => run(fake));
  const menus = { forEmployee: vi.fn().mockResolvedValue(menu) };
  const settings = {
    get: vi.fn().mockResolvedValue(DEFAULT_SETTINGS),
    listHolidays: vi.fn().mockResolvedValue([]),
  };
  const service = new OrdersService(
    fake as unknown as PrismaService,
    menus as unknown as MenuService,
    settings as unknown as SettingsService,
  );
  if (skipDue) vi.spyOn(service, 'processDue').mockResolvedValue({ confirmed: 0, cancelled: 0 });
  return { fake, menus, settings, company, service };
}
beforeEach(() => vi.restoreAllMocks());

describe('order service validation and snapshots', () => {
  it('uses the same transaction for menu/pricing/settings reads and order creation', async () => {
    const { service, fake, menus, settings } = setup();
    await service.create(body(), admin);
    expect(menus.forEmployee).toHaveBeenCalledWith(id(10), [], fake);
    expect(settings.get).toHaveBeenCalledWith(fake);
    expect(fake.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    );
    expect(fake.order.create.mock.calls[0]![0].data).toMatchObject({
      totalCents: 1700,
      employeeName: 'Priya',
      companyName: 'Company',
      status: 'PLACED',
    });
    expect(fake.prepUnit.createMany).not.toHaveBeenCalled();
  });
  it('returns only public form context, never company billing data/settings rows', async () => {
    const { service } = setup();
    const context = await service.context(id(10), '2099-01-07');
    expect(context).toHaveProperty('menu');
    expect(context).not.toHaveProperty('company');
    expect(context).not.toHaveProperty('settings');
    expect(context).not.toHaveProperty('calendar');
    expect(JSON.stringify(context)).not.toContain('private@example.com');
  });
  it('allows an empty draft but not placement without lines', async () => {
    const { service, fake } = setup();
    await service.create(body({ intent: 'draft', lines: [] }), admin);
    expect(fake.order.create.mock.calls[0]![0].data).toMatchObject({
      totalCents: 0,
      status: 'DRAFT',
    });
    await expect(service.create(body({ lines: [] }), admin)).rejects.toMatchObject({
      body: { fieldErrors: { lines: expect.any(Array) } },
    });
  });
  it('rejects company holidays without using them to move the cutoff', async () => {
    const { service, company } = setup();
    Object.assign(company, {
      holidays: [{ startDate: new Date('2099-01-07'), endDate: new Date('2099-01-07') }],
    });
    const context = await service.context(id(10), '2099-01-07');
    await expect(service.create(body(), admin)).rejects.toMatchObject({
      body: { fieldErrors: { deliveryDate: expect.any(Array) } },
    });
    expect(new Date(context.cutoffAt).getTime()).toBeGreaterThan(0);
  });
  it('rejects kitchen holidays and inactive companies even for admins', async () => {
    const { service, settings, company } = setup();
    settings.listHolidays.mockResolvedValue([{ startDate: '2099-01-07', endDate: '2099-01-07' }]);
    await expect(service.create(body(), admin)).rejects.toMatchObject({
      body: { fieldErrors: { deliveryDate: expect.any(Array) } },
    });
    settings.listHolidays.mockResolvedValue([]);
    company.isActive = false;
    await expect(service.create(body(), admin)).rejects.toMatchObject({
      body: { fieldErrors: { employeeId: expect.any(Array) } },
    });
  });
  it('server-enforces employee delivery flags and the platform time window', async () => {
    const { service, fake } = setup();
    await expect(service.create(body({ deliveryTimeMinutes: 735 }), admin)).rejects.toMatchObject({
      body: { fieldErrors: { deliveryTimeMinutes: expect.any(Array) } },
    });
    fake.employee.findUnique.mockResolvedValue({
      ...(await fake.employee.findUnique()),
      canChangeDeliveryTime: true,
    });
    await expect(service.create(body({ deliveryTimeMinutes: 0 }), admin)).rejects.toMatchObject({
      body: { fieldErrors: { deliveryTimeMinutes: expect.any(Array) } },
    });
    await expect(service.create(body({ addressId: id(99) }), admin)).rejects.toMatchObject({
      body: { fieldErrors: { addressId: expect.any(Array) } },
    });
  });
  it('gives duplicate orders an actionable link identifier', async () => {
    const { service, fake } = setup();
    fake.order.findFirst.mockResolvedValue(orderRow());
    await expect(service.create(body(), admin)).rejects.toMatchObject({
      body: { code: 'ORDER_EXISTS', fieldErrors: { existingOrderId: [id(100)] } },
    });
  });
  it('confirms admin placement on an early-closed date and creates prep units', async () => {
    const { service, fake } = setup();
    fake.orderClosure.findUnique.mockResolvedValue({
      deliveryDate: new Date('2099-01-07'),
      actorId: admin.id,
    });
    await service.create(body(), admin);
    expect(fake.order.create.mock.calls[0]![0].data.status).toBe('CONFIRMED');
    expect(fake.prepUnit.createMany).toHaveBeenCalledOnce();
    expect(fake.orderEvent.create.mock.calls.map((c) => c[0].data.type)).toEqual([
      'CREATED',
      'PLACED',
      'CONFIRMED',
    ]);
    await expect(service.create(body({ intent: 'draft' }), admin)).rejects.toMatchObject({
      body: { fieldErrors: { intent: expect.any(Array) } },
    });
  });
  it('blocks non-admin placement on a closed date', async () => {
    const { service, fake } = setup();
    fake.orderClosure.findUnique.mockResolvedValue({ actorId: admin.id });
    await expect(
      service.create(body(), { ...admin, permissions: ['orders.write'] }),
    ).rejects.toMatchObject({ body: { code: 'CUTOFF_PASSED' } });
  });
  it('unchanged edits keep saved prices, cutoff, address text and line/combination IDs', async () => {
    const { service, fake, menus } = setup();
    const row = orderRow();
    menus.forEmployee.mockResolvedValue({ ...menu, categories: [] });
    await service.update(
      row.id,
      body({ version: 0, intent: 'draft', lines: [{ ...body().lines[0]!, id: row.lines[0]!.id }] }),
      admin,
    );
    expect(fake.order.update.mock.calls[0]![0].data).toMatchObject({
      totalCents: 1700,
      cutoffAt: row.cutoffAt,
      addressText: 'Saved address',
    });
    expect(fake.orderLine.deleteMany).toHaveBeenCalledWith({
      where: { orderId: row.id, id: { notIn: [id(30)] } },
    });
    expect(fake.orderLine.create).not.toHaveBeenCalled();
  });
  it('changed lines are revalidated and priced from the current menu', async () => {
    const { service, fake, menus } = setup();
    menus.forEmployee.mockResolvedValue({
      ...menu,
      categories: [{ ...menu.categories[0]!, dishes: [{ ...dish, priceCents: 1000 }] }],
    });
    await service.update(
      id(100),
      body({
        version: 0,
        lines: [
          {
            ...body().lines[0]!,
            id: id(30),
            quantity: 3,
            combinations: [{ quantity: 3, optionIds: [id(4)] }],
          },
        ],
      }),
      admin,
    );
    expect(fake.order.update.mock.calls[0]![0].data.totalCents).toBe(3150);
    expect(fake.orderLine.create.mock.calls[0]![0].data.dishPriceCents).toBe(1000);
  });
  it('refuses stale edits before writing anything', async () => {
    const { service, fake } = setup();
    await expect(service.update(id(100), body({ version: 99 }), admin)).rejects.toMatchObject({
      body: { code: 'CONCURRENT_UPDATE' },
    });
    expect(fake.order.update).not.toHaveBeenCalled();
  });
  it('requires rejection reason and checks snapshot minima when placing a saved draft', async () => {
    const { service, fake } = setup();
    fake.order.findUnique.mockResolvedValue({ ...orderRow(), status: 'PLACED' });
    await expect(
      service.action(id(100), 'reject', { version: 0, reason: '' }, admin),
    ).rejects.toMatchObject({ body: { fieldErrors: { reason: expect.any(Array) } } });
    const row = orderRow();
    row.lines[0]!.minOrderQty = 5;
    fake.order.findUnique.mockResolvedValue(row);
    await expect(
      service.action(id(100), 'place', { version: 0, reason: '' }, admin),
    ).rejects.toMatchObject({ body: { fieldErrors: { 'lines.0.quantity': expect.any(Array) } } });
  });
  it('redacts all nested monetary fields without mutating the saved line', () => {
    const line = savedLine(savedRow());
    const visible = visibleLine(line, false);
    expect(JSON.stringify(visible)).not.toContain('Cents');
    expect(line.totalCents).toBe(1700);
    expect(visible.combinations[0]?.options[0]?.name).toBe('Rice');
    expect(visibleLine(line, true)).toEqual(line);
  });
  it('retries serialization failures, not arbitrary errors or stale-version errors', async () => {
    const { service, fake } = setup();
    fake.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    const run = vi.fn().mockResolvedValue('ok');
    expect(await service.transaction(run)).toBe('ok');
    expect(fake.$transaction).toHaveBeenCalledTimes(2);
    fake.$transaction.mockRejectedValueOnce(new Error('database offline'));
    await expect(service.transaction(run)).rejects.toThrow('database offline');
  });
});

describe('batched cutoff processing', () => {
  it('updates pending statuses, units and events together, and repeating does nothing', async () => {
    const { service, fake } = setup(false);
    fake.order.findFirst.mockResolvedValueOnce({ id: id(100) }).mockResolvedValue(null);
    fake.order.findMany.mockResolvedValueOnce([
      { ...orderRow(), cutoffAt: new Date(0) },
      { ...orderRow(), id: id(101), status: 'PLACED', cutoffAt: new Date(0) },
    ]);
    expect(await service.processDue()).toEqual({ confirmed: 1, cancelled: 1 });
    expect(fake.order.updateMany.mock.calls.map((c) => c[0].data.status)).toEqual([
      'CANCELLED',
      'CONFIRMED',
    ]);
    expect(fake.prepUnit.createMany.mock.calls[0]![0].data).toHaveLength(1);
    expect(
      fake.orderEvent.createMany.mock.calls[0]![0].data.map((e: { type: string }) => e.type),
    ).toEqual(['CANCELLED', 'CONFIRMED']);
    expect(await service.processDue()).toEqual({ confirmed: 0, cancelled: 0 });
    expect(fake.orderEvent.createMany).toHaveBeenCalledOnce();
  });
});
