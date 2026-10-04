import { describe, expect, it, vi } from 'vitest';
import { ALL_PERMISSIONS, BillingQuerySchema, type SessionUser } from '@fernleaf/shared';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OrdersService } from '../orders/orders.service.js';
import { BillingService } from './billing.service.js';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const admin = { id: id(90), permissions: ALL_PERMISSIONS } as SessionUser;
function fixture() {
  const row = {
    id: id(1),
    sequence: 1,
    companyId: id(10),
    companyName: 'Saved Company',
    employeeName: 'Employee',
    deliveryDate: new Date('2026-10-05'),
    status: 'CONFIRMED',
    invoiceId: null as string | null,
    totalCents: 211,
    version: 2,
    billingReviewReason: '',
    shortDeliveryNote: '',
  };
  const invoice = {
    id: id(20),
    sequence: 1,
    companyId: id(10),
    companyName: 'Company',
    billingContactName: 'Contact',
    billingEmail: 'billing@company.example',
    totalCents: 211,
    orderCount: 1,
    version: 0,
    issuedAt: new Date('2026-10-04T00:00:00Z'),
    paidAt: null as Date | null,
    _count: { orders: 0 },
  };
  const db = {
    $queryRaw: vi.fn(),
    company: {
      findUnique: vi.fn().mockResolvedValue({
        id: id(10),
        name: 'Company',
        billingContactName: 'Contact',
        billingEmail: 'billing@company.example',
      }),
    },
    order: {
      findMany: vi.fn().mockResolvedValue([row]),
      findUnique: vi.fn().mockResolvedValue(row),
      count: vi.fn().mockResolvedValue(1),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn(),
    },
    invoice: {
      create: vi.fn().mockResolvedValue(invoice),
      findUnique: vi.fn().mockResolvedValue(invoice),
      findMany: vi.fn().mockResolvedValue([invoice]),
      count: vi.fn().mockResolvedValue(1),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    orderEvent: { createMany: vi.fn() },
  };
  const orders = {
    transaction: vi.fn(async (run: (tx: typeof db) => Promise<unknown>) => run(db)),
    processDue: vi.fn(),
    event: vi.fn(),
  };
  const service = new BillingService(
    db as unknown as PrismaService,
    orders as unknown as OrdersService,
  );
  const input = { companyId: id(10), orders: [{ id: id(1), version: 2 }] };
  return { row, invoice, db, orders, service, input };
}
describe('internal invoice rules', () => {
  it('uses exact saved totals and saved billing contact, attaches orders and records the timeline atomically', async () => {
    const f = fixture();
    await expect(f.service.create(f.input, admin)).resolves.toEqual({ id: id(20) });
    expect(f.db.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        totalCents: 211,
        orderCount: 1,
        billingEmail: 'billing@company.example',
      }),
    });
    expect(f.db.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ invoiceId: null }),
        data: { invoiceId: id(20), version: { increment: 1 } },
      }),
    );
    expect(f.db.orderEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ orderId: id(1), type: 'INVOICED' })],
    });
    expect(f.db.$queryRaw).toHaveBeenCalledOnce();
    expect(f.orders.transaction).toHaveBeenCalledOnce();
  });
  it('includes delivered orders because confirmation remains billable after fulfilment', async () => {
    const f = fixture();
    f.row.status = 'DELIVERED';
    await expect(f.service.create(f.input, admin)).resolves.toEqual({ id: id(20) });
  });
  it('rejects other companies, already-invoiced and non-billable statuses before invoice creation', async () => {
    for (const change of [
      { companyId: id(11) },
      { invoiceId: id(99) },
      { status: 'DRAFT' },
      { status: 'PLACED' },
      { status: 'CANCELLED' },
      { status: 'REJECTED' },
    ]) {
      const f = fixture();
      Object.assign(f.row, change);
      await expect(f.service.create(f.input, admin)).rejects.toMatchObject({
        body: { code: 'ORDER_NOT_BILLABLE' },
      });
      expect(f.db.invoice.create).not.toHaveBeenCalled();
    }
  });
  it('rejects stale versions and missing orders', async () => {
    const f = fixture();
    f.row.version = 3;
    await expect(f.service.create(f.input, admin)).rejects.toMatchObject({
      body: { code: 'CONCURRENT_UPDATE' },
    });
    f.db.order.findMany.mockResolvedValue([]);
    await expect(f.service.create(f.input, admin)).rejects.toMatchObject({
      body: { code: 'VALIDATION_FAILED' },
    });
    expect(f.db.invoice.create).not.toHaveBeenCalled();
  });
  it('rejects invoice overflow before writing', async () => {
    const f = fixture();
    f.row.totalCents = 2_147_483_648;
    await expect(f.service.create(f.input, admin)).rejects.toMatchObject({
      body: { code: 'VALIDATION_FAILED' },
    });
    expect(f.db.invoice.create).not.toHaveBeenCalled();
  });
  it('rejects failed membership claims inside the invoice transaction', async () => {
    const f = fixture();
    f.db.order.updateMany.mockResolvedValue({ count: 0 });
    await expect(f.service.create(f.input, admin)).rejects.toMatchObject({
      body: { code: 'CONCURRENT_UPDATE' },
    });
    expect(f.db.orderEvent.createMany).not.toHaveBeenCalled();
  });
  it('records full payment once, without mutating totals', async () => {
    const f = fixture();
    await f.service.pay(id(20), 0, admin);
    expect(f.db.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: id(20), version: 0, paidAt: null },
      data: { paidAt: expect.any(Date), version: { increment: 1 } },
    });
    expect(f.db.orderEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ type: 'PAID' })],
    });
    f.invoice.paidAt = new Date();
    await expect(f.service.pay(id(20), 0, admin)).rejects.toMatchObject({
      body: { code: 'INVOICE_ALREADY_PAID' },
    });
  });
  it('refuses stale or contested payment', async () => {
    const f = fixture();
    await expect(f.service.pay(id(20), 1, admin)).rejects.toMatchObject({
      body: { code: 'CONCURRENT_UPDATE' },
    });
    f.db.invoice.updateMany.mockResolvedValue({ count: 0 });
    await expect(f.service.pay(id(20), 0, admin)).rejects.toMatchObject({
      body: { code: 'CONCURRENT_UPDATE' },
    });
  });
  it('short-delivery reports preserve full amounts and flag invoiced orders for review', async () => {
    const f = fixture();
    await expect(
      f.service.reportShort(id(1), { version: 2, note: 'Missing one bowl' }, admin),
    ).rejects.toMatchObject({ body: { code: 'ORDER_NOT_DELIVERED' } });
    f.row.status = 'DELIVERED';
    f.row.invoiceId = id(20);
    await f.service.reportShort(id(1), { version: 2, note: 'Missing one bowl' }, admin);
    expect(f.db.order.update).toHaveBeenCalledWith({
      where: { id: id(1), version: 2 },
      data: {
        shortDeliveryNote: 'Missing one bowl',
        billingReviewReason: 'Short delivery: Missing one bowl',
        version: { increment: 1 },
      },
    });
    expect(f.db.invoice.updateMany).not.toHaveBeenCalled();
  });
  it('short reports before invoicing are notes only, not credits', async () => {
    const f = fixture();
    f.row.status = 'DELIVERED';
    await f.service.reportShort(id(1), { version: 2, note: 'Missing sauce' }, admin);
    expect(f.db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { shortDeliveryNote: 'Missing sauce', version: { increment: 1 } },
      }),
    );
  });
  it('uninvoiced queries filter confirmed/delivered orders and paginate by delivery date', async () => {
    const f = fixture();
    await f.service.uninvoiced(
      BillingQuerySchema.parse({ companyId: id(10), through: '2026-10-09', page: 2, pageSize: 10 }),
    );
    expect(f.db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: id(10),
          invoiceId: null,
          status: { in: ['CONFIRMED', 'DELIVERED'] },
          deliveryDate: { lte: new Date('2026-10-09') },
        },
        skip: 10,
        take: 10,
      }),
    );
  });
  it('review counts cover the whole invoice, not just the visible order page', async () => {
    const f = fixture();
    f.invoice._count.orders = 2;
    const result = await f.service.get(id(20), { page: 2, pageSize: 10 });
    expect(result.needsReview).toBe(true);
    expect(f.db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { invoiceId: id(20) }, skip: 10, take: 10 }),
    );
  });
  it('invoice filters separate unpaid amounts and review flags', async () => {
    const f = fixture();
    await f.service.list(
      BillingQuerySchema.parse({ companyId: id(10), status: 'UNPAID', review: 'true' }),
    );
    expect(f.db.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: id(10),
          paidAt: null,
          orders: { some: { billingReviewReason: { not: '' } } },
        },
      }),
    );
  });
});
