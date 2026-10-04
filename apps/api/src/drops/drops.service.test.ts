import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_PERMISSIONS, DropQuerySchema, type SessionUser } from '@fernleaf/shared';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OrdersService } from '../orders/orders.service.js';
import { DropsService } from './drops.service.js';
vi.mock('@vercel/blob', () => ({
  put: vi.fn().mockResolvedValue({ url: 'https://test.public.blob.vercel-storage.com/proof.jpg' }),
  del: vi.fn().mockResolvedValue(undefined),
}));
import { put, del } from '@vercel/blob';
const driver = { id: 'driver', permissions: ['deliveries.own'] } as SessionUser;
const admin = { id: 'admin', permissions: ALL_PERMISSIONS } as SessionUser;
function fixture() {
  const row = {
    id: 'drop',
    version: 3,
    companyId: 'company',
    deliveryDate: new Date('2026-10-05'),
    deliveryTimeMinutes: 720,
    driverId: 'driver',
    status: 'WAITING',
    company: { name: 'Company' },
    driver: { id: 'driver', name: 'Driver', isActive: true },
    orders: [{ addressText: 'Saved address', companyName: 'Saved company' }],
    _count: { orders: 2 },
    dispatchReadyAt: null,
    outForDeliveryAt: null,
    deliveredAt: null,
    onTime: null,
    deliveryNote: '',
    photoUrl: null,
  };
  const members = [
    { id: 'one', status: 'CONFIRMED', kitchenReadyAt: new Date() },
    { id: 'two', status: 'CONFIRMED', kitchenReadyAt: new Date() },
  ];
  const db = {
    $queryRaw: vi.fn(),
    drop: {
      findUnique: vi.fn().mockResolvedValue(row),
      findFirst: vi.fn().mockResolvedValue(row),
      findMany: vi.fn().mockResolvedValue([row]),
      count: vi.fn().mockResolvedValue(1),
      update: vi.fn(),
    },
    order: {
      findMany: vi.fn().mockResolvedValue(members),
      updateMany: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([{ dropId: 'drop', _count: { _all: 2 } }]),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue({ id: 'driver', name: 'Driver' }),
      findMany: vi.fn(),
    },
    orderEvent: { createMany: vi.fn() },
  };
  const orders = {
    transaction: vi.fn(async (run: (tx: typeof db) => Promise<unknown>) => run(db)),
    processDue: vi.fn(),
  };
  const service = new DropsService(
    db as unknown as PrismaService,
    orders as unknown as OrdersService,
  );
  return { row, members, db, orders, service };
}
describe('drop progression and delivery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T06:30:00Z'));
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
  it('requires every order kitchen-ready and blocks empty drops', async () => {
    const f = fixture();
    f.members[1]!.kitchenReadyAt = null as unknown as Date;
    await expect(f.service.advance('drop', 3, 'ready', admin)).rejects.toMatchObject({
      body: { code: 'KITCHEN_NOT_READY' },
    });
    f.db.order.findMany.mockResolvedValue([]);
    await expect(f.service.advance('drop', 3, 'ready', admin)).rejects.toMatchObject({
      body: { code: 'KITCHEN_NOT_READY' },
    });
    expect(f.db.drop.update).not.toHaveBeenCalled();
  });
  it('marks readiness once and rejects stale or repeated steps', async () => {
    const f = fixture();
    await f.service.advance('drop', 3, 'ready', admin);
    expect(f.db.drop.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DISPATCH_READY',
          dispatchReadyAt: expect.any(Date),
        }),
      }),
    );
    await expect(f.service.advance('drop', 2, 'ready', admin)).rejects.toMatchObject({
      body: { code: 'CONCURRENT_UPDATE' },
    });
    f.row.status = 'DISPATCH_READY';
    await expect(f.service.advance('drop', 3, 'ready', admin)).rejects.toMatchObject({
      body: { code: 'INVALID_DROP_STEP' },
    });
  });
  it('requires readiness and an active eligible driver before departure', async () => {
    const f = fixture();
    await expect(f.service.advance('drop', 3, 'depart', admin)).rejects.toMatchObject({
      body: { code: 'INVALID_DROP_STEP' },
    });
    f.row.status = 'DISPATCH_READY';
    f.row.driverId = null as unknown as string;
    await expect(f.service.advance('drop', 3, 'depart', admin)).rejects.toMatchObject({
      body: { code: 'DRIVER_REQUIRED' },
    });
    f.row.driverId = 'driver';
    f.db.user.findFirst.mockResolvedValue(null);
    await expect(f.service.advance('drop', 3, 'depart', admin)).rejects.toMatchObject({
      body: { fieldErrors: { driverId: expect.any(Array) } },
    });
  });
  it('departing updates every order and records the assigned driver', async () => {
    const f = fixture();
    f.row.status = 'DISPATCH_READY';
    await f.service.advance('drop', 3, 'depart', admin);
    expect(f.db.order.updateMany).toHaveBeenCalledWith({
      where: { dropId: 'drop' },
      data: { outForDeliveryAt: expect.any(Date), version: { increment: 1 } },
    });
    expect(f.db.orderEvent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          type: 'OUT_FOR_DELIVERY',
          description: 'Drop departed with Driver',
        }),
      ]),
    });
  });
  it('allows assignments only before departure and rejects invalid drivers', async () => {
    const f = fixture();
    await f.service.assign('drop', 3, null, admin);
    expect(f.db.drop.update).toHaveBeenCalledWith({
      where: { id: 'drop' },
      data: { driverId: null, version: { increment: 1 } },
    });
    f.db.user.findFirst.mockResolvedValue(null);
    await expect(f.service.assign('drop', 3, 'invalid', admin)).rejects.toMatchObject({
      body: { fieldErrors: { driverId: expect.any(Array) } },
    });
    for (const status of ['OUT_FOR_DELIVERY', 'DELIVERED']) {
      f.row.status = status;
      await expect(f.service.assign('drop', 3, 'driver', admin)).rejects.toMatchObject({
        body: { code: 'DROP_ALREADY_DEPARTED' },
      });
    }
  });
  it('restricts delivery to the assigned driver today, after departure', async () => {
    const f = fixture();
    f.row.status = 'OUT_FOR_DELIVERY';
    await expect(f.service.deliver('drop', { version: 3, note: '' }, admin)).rejects.toMatchObject({
      body: { code: 'NOT_FOUND' },
    });
    f.row.deliveryDate = new Date('2026-10-06');
    await expect(f.service.deliver('drop', { version: 3, note: '' }, driver)).rejects.toMatchObject(
      { body: { code: 'NOT_FOUND' } },
    );
    f.row.deliveryDate = new Date('2026-10-05');
    f.row.status = 'DELIVERED';
    await expect(f.service.deliver('drop', { version: 3, note: '' }, driver)).rejects.toMatchObject(
      { body: { code: 'DELIVERY_NOT_OUT' } },
    );
  });
  it('completes all orders and records note, timestamp and exact late result', async () => {
    const f = fixture();
    f.row.status = 'OUT_FOR_DELIVERY';
    vi.setSystemTime(new Date('2026-10-05T06:30:00.001Z'));
    await f.service.deliver('drop', { version: 3, note: 'Reception' }, driver);
    expect(f.db.drop.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DELIVERED',
          onTime: false,
          deliveryNote: 'Reception',
          photoUrl: null,
        }),
      }),
    );
    expect(f.db.order.updateMany).toHaveBeenCalledWith({
      where: { dropId: 'drop' },
      data: { status: 'DELIVERED', version: { increment: 1 } },
    });
  });
  it('checks ownership before uploading and rejects spoofed image types', async () => {
    const f = fixture();
    f.row.status = 'OUT_FOR_DELIVERY';
    const file = {
      size: 10,
      mimetype: 'image/jpeg',
      buffer: Buffer.from('not a jpg'),
    } as Express.Multer.File;
    await expect(
      f.service.deliver('drop', { version: 3, note: '' }, admin, file),
    ).rejects.toMatchObject({ body: { code: 'NOT_FOUND' } });
    await expect(
      f.service.deliver('drop', { version: 3, note: '' }, driver, file),
    ).rejects.toMatchObject({ body: { fieldErrors: { photo: expect.any(Array) } } });
    expect(put).not.toHaveBeenCalled();
  });
  it('stores a server-issued photo URL and cleans it up if the transaction fails', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-token');
    const f = fixture();
    f.row.status = 'OUT_FOR_DELIVERY';
    const file = {
      size: 3,
      mimetype: 'image/jpeg',
      buffer: Buffer.from([255, 216, 255]),
    } as Express.Multer.File;
    await f.service.deliver('drop', { version: 3, note: '' }, driver, file);
    expect(f.db.drop.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          photoUrl: 'https://test.public.blob.vercel-storage.com/proof.jpg',
        }),
      }),
    );
    f.orders.transaction.mockRejectedValueOnce(new Error('rolled back'));
    await expect(f.service.deliver('drop', { version: 3, note: '' }, driver, file)).rejects.toThrow(
      'rolled back',
    );
    expect(del).toHaveBeenCalledWith('https://test.public.blob.vercel-storage.com/proof.jpg');
  });
  it('ignores supplied date/company filters in the own-deliveries view and exposes no money', async () => {
    const f = fixture();
    const data = await f.service.list(
      DropQuerySchema.parse({
        deliveryDate: '2099-10-07',
        companyId: '00000000-0000-4000-8000-000000000001',
      }),
      driver,
      true,
    );
    expect(f.db.drop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { driverId: 'driver', deliveryDate: new Date('2026-10-05') },
      }),
    );
    expect(data.items[0]!.state).toBe('KITCHEN_READY');
    expect(JSON.stringify(data)).not.toContain('Cents');
    await f.service.list(DropQuerySchema.parse({ deliveryDate: '2099-10-07' }), driver);
    expect(f.db.drop.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { driverId: 'driver', deliveryDate: new Date('2026-10-05') },
      }),
    );
  });
  it('scopes driver detail reads by owner and kitchen date', async () => {
    const f = fixture();
    f.db.drop.findFirst.mockResolvedValue(null);
    await expect(f.service.get('other', { page: 1, pageSize: 20 }, driver)).rejects.toMatchObject({
      body: { code: 'NOT_FOUND' },
    });
    expect(f.db.drop.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'other', driverId: 'driver', deliveryDate: new Date('2026-10-05') },
      }),
    );
  });
});
