import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../generated/prisma/client.js';
import { DropMembershipService } from './drop-membership.service.js';
function fixture() {
  const order = {
    id: 'order',
    status: 'CONFIRMED',
    dropId: 'old',
    companyId: 'company',
    addressId: 'address',
    deliveryDate: new Date('2026-10-05'),
    deliveryTimeMinutes: 720,
  };
  const target = { id: 'new', status: 'WAITING', driverId: 'driver' };
  const tx = {
    order: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(order),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([{ id: 'order' }]),
    },
    drop: {
      findUnique: vi.fn().mockResolvedValue(target),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn().mockResolvedValue(target),
    },
    company: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        defaultDriver: {
          id: 'driver',
          isActive: true,
          role: { permissions: ['deliveries.own'] },
        },
      }),
    },
    orderEvent: { createMany: vi.fn() },
  };
  const run = () =>
    new DropMembershipService().sync(tx as unknown as Prisma.TransactionClient, 'order');
  return { order, target, tx, run };
}
describe('atomic drop membership', () => {
  it('attaches a 100-order batch with a bounded query count and parameterized ids', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), $executeRaw: vi.fn() };
    const ids = Array.from(
      { length: 100 },
      (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    );
    await new DropMembershipService().confirmBatch(tx as unknown as Prisma.TransactionClient, ids);
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
    for (const call of tx.$executeRaw.mock.calls)
      expect(call.slice(1).flatMap((value) => value.values ?? [])).toEqual(
        expect.arrayContaining(ids),
      );
  });
  it('refuses progressed batch targets and records ready-drop reopenings', async () => {
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([
          { id: '00000000-0000-4000-8000-000000000001', status: 'OUT_FOR_DELIVERY' },
        ]),
      $executeRaw: vi.fn(),
    };
    const service = new DropMembershipService();
    await expect(
      service.confirmBatch(tx as unknown as Prisma.TransactionClient, [
        '00000000-0000-4000-8000-000000000002',
      ]),
    ).rejects.toMatchObject({ body: { code: 'DROP_ALREADY_DEPARTED' } });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    tx.$queryRaw.mockResolvedValue([
      { id: '00000000-0000-4000-8000-000000000001', status: 'DISPATCH_READY' },
    ]);
    await service.confirmBatch(tx as unknown as Prisma.TransactionClient, [
      '00000000-0000-4000-8000-000000000002',
    ]);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(4);
  });
  it('joins by the full date/company/address/time key and removes an empty old drop', async () => {
    const f = fixture();
    await f.run();
    expect(f.tx.drop.findUnique).toHaveBeenCalledWith({
      where: {
        companyId_addressId_deliveryDate_deliveryTimeMinutes: {
          companyId: 'company',
          addressId: 'address',
          deliveryDate: f.order.deliveryDate,
          deliveryTimeMinutes: 720,
        },
      },
    });
    expect(f.tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order' },
      data: { dropId: 'new' },
    });
    expect(f.tx.drop.delete).toHaveBeenCalledWith({ where: { id: 'old' } });
  });
  it('reopens dispatch-ready without overwriting its driver and records the reopening', async () => {
    const f = fixture();
    f.target.status = 'DISPATCH_READY';
    await f.run();
    expect(f.tx.drop.update).toHaveBeenCalledWith({
      where: { id: 'new' },
      data: { status: 'WAITING', dispatchReadyAt: null, version: { increment: 1 } },
    });
    expect(f.tx.orderEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ type: 'DISPATCH_REOPENED' })],
    });
  });
  it('refuses departed and delivered targets before updating any membership', async () => {
    const f = fixture();
    for (const status of ['OUT_FOR_DELIVERY', 'DELIVERED']) {
      f.target.status = status;
      await expect(f.run()).rejects.toMatchObject({ body: { code: 'DROP_ALREADY_DEPARTED' } });
    }
    expect(f.tx.order.update).not.toHaveBeenCalled();
  });
  it('does not reopen a drop when membership has not changed', async () => {
    const f = fixture();
    f.order.dropId = 'new';
    await f.run();
    expect(f.tx.drop.update).not.toHaveBeenCalled();
  });
  it('creates a drop with an eligible default driver', async () => {
    const f = fixture();
    f.tx.drop.findUnique.mockResolvedValue(null);
    await f.run();
    expect(f.tx.drop.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ driverId: 'driver' }),
        update: {},
      }),
    );
  });
  it('does not assign inactive or no-longer-eligible default drivers', async () => {
    for (const driver of [
      { id: 'driver', isActive: false, role: { permissions: ['deliveries.own'] } },
      { id: 'driver', isActive: true, role: { permissions: [] } },
    ]) {
      const f = fixture();
      f.tx.drop.findUnique.mockResolvedValue(null);
      f.tx.company.findUniqueOrThrow.mockResolvedValue({ defaultDriver: driver });
      await f.run();
      expect(f.tx.drop.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ driverId: null }) }),
      );
    }
  });
  it('detaches cancelled/rejected orders but retains delivered history', async () => {
    for (const status of ['CANCELLED', 'REJECTED']) {
      const f = fixture();
      f.order.status = status;
      await f.run();
      expect(f.tx.order.update).toHaveBeenCalledWith({
        where: { id: 'order' },
        data: { dropId: null },
      });
    }
    const f = fixture();
    f.order.status = 'DELIVERED';
    await f.run();
    expect(f.tx.order.update).not.toHaveBeenCalled();
  });
  it('retains nonempty old drops and their drivers while invalidating stale actions', async () => {
    const f = fixture();
    f.tx.order.count.mockResolvedValue(1);
    await f.run();
    expect(f.tx.drop.update).toHaveBeenCalledWith({
      where: { id: 'old' },
      data: { version: { increment: 1 } },
    });
    expect(f.tx.drop.delete).not.toHaveBeenCalled();
  });
});
