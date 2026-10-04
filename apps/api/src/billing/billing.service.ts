import { HttpStatus, Injectable } from '@nestjs/common';
import {
  invoiceNumber,
  invoiceTotal,
  orderNumber,
  pageOffset,
  type BillingOrder,
  type BillingQuery,
  type InvoiceCreate,
  type InvoiceDetail,
  type InvoiceSummary,
  type PageQuery,
  type Paginated,
  type SessionUser,
} from '@fernleaf/shared';
import { ApiException } from '../common/api-exception.js';
import { fromDbDate, toDbDate } from '../common/db-dates.js';
import { Prisma, type Invoice, type Order } from '../generated/prisma/client.js';
import { OrdersService } from '../orders/orders.service.js';
import { requireVersion } from '../orders/orders.policy.js';
import { PrismaService } from '../prisma/prisma.service.js';

export function billingOrder(o: Order): BillingOrder {
  return {
    id: o.id,
    number: orderNumber(o.sequence),
    employeeName: o.employeeName,
    companyName: o.companyName,
    deliveryDate: fromDbDate(o.deliveryDate),
    status: o.status,
    totalCents: o.totalCents,
    version: o.version,
    billingReviewReason: o.billingReviewReason,
    shortDeliveryNote: o.shortDeliveryNote,
  };
}
const reviewWhere = { billingReviewReason: { not: '' } } as const;
export function invoiceSummary(i: Invoice, needsReview: boolean): InvoiceSummary {
  return {
    id: i.id,
    number: invoiceNumber(i.sequence, i.issuedAt),
    company: { id: i.companyId, name: i.companyName },
    totalCents: i.totalCents,
    orderCount: i.orderCount,
    issuedAt: i.issuedAt.toISOString(),
    paidAt: i.paidAt?.toISOString() ?? null,
    version: i.version,
    needsReview,
  };
}
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}
  companies() {
    return this.prisma.company.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
  async uninvoiced(query: BillingQuery): Promise<Paginated<BillingOrder>> {
    await this.orders.processDue();
    const where: Prisma.OrderWhereInput = {
      invoiceId: null,
      status: { in: ['CONFIRMED', 'DELIVERED'] },
      ...(query.companyId && { companyId: query.companyId }),
      ...(query.through && { deliveryDate: { lte: toDbDate(query.through) } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: [{ deliveryDate: 'asc' }, { sequence: 'asc' }],
        skip: pageOffset(query),
        take: query.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items: rows.map(billingOrder), total, page: query.page, pageSize: query.pageSize };
  }
  async list(query: BillingQuery): Promise<Paginated<InvoiceSummary>> {
    const where: Prisma.InvoiceWhereInput = {
      ...(query.companyId && { companyId: query.companyId }),
      ...(query.status && { paidAt: query.status === 'PAID' ? { not: null } : null }),
      ...(query.review && {
        orders: query.review === 'true' ? { some: reviewWhere } : { none: reviewWhere },
      }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: [{ issuedAt: 'desc' }, { sequence: 'desc' }],
        skip: pageOffset(query),
        take: query.pageSize,
        include: { _count: { select: { orders: { where: reviewWhere } } } },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return {
      items: rows.map((i) => invoiceSummary(i, i._count.orders > 0)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
  async get(id: string, query: PageQuery): Promise<InvoiceDetail> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { _count: { select: { orders: { where: reviewWhere } } } },
    });
    if (!invoice) throw ApiException.notFound('Invoice');
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { invoiceId: id },
        orderBy: [{ deliveryDate: 'asc' }, { sequence: 'asc' }],
        skip: pageOffset(query),
        take: query.pageSize,
      }),
      this.prisma.order.count({ where: { invoiceId: id } }),
    ]);
    return {
      ...invoiceSummary(invoice, invoice._count.orders > 0),
      billingContactName: invoice.billingContactName,
      billingEmail: invoice.billingEmail,
      orders: { items: rows.map(billingOrder), total, page: query.page, pageSize: query.pageSize },
    };
  }
  async create(input: InvoiceCreate, user: SessionUser) {
    await this.orders.processDue();
    return this.orders.transaction(async (tx) => {
      const ids = input.orders.map((o) => o.id).sort();
      // Stable lock order plus Serializable retry prevents overlap and concurrent repricing/cancellation.
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM orders WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`,
      );
      const rows = await tx.order.findMany({ where: { id: { in: ids } } });
      if (rows.length !== ids.length)
        throw ApiException.validation({
          orders: ['Some selected orders no longer exist. Refresh.'],
        });
      for (const row of rows) {
        if (
          row.companyId !== input.companyId ||
          row.invoiceId ||
          !['CONFIRMED', 'DELIVERED'].includes(row.status)
        )
          throw new ApiException(
            HttpStatus.CONFLICT,
            'ORDER_NOT_BILLABLE',
            'Selected orders must belong to this company and be confirmed/delivered and uninvoiced. Refresh.',
          );
        requireVersion(row.version, input.orders.find((o) => o.id === row.id)!.version);
      }
      const company = await tx.company.findUnique({ where: { id: input.companyId } });
      if (!company) throw ApiException.notFound('Company');
      let totalCents: number;
      try {
        totalCents = invoiceTotal(rows.map((o) => o.totalCents));
      } catch (error) {
        throw ApiException.validation({
          orders: [error instanceof Error ? error.message : 'Invalid invoice amount'],
        });
      }
      const invoice = await tx.invoice.create({
        data: {
          companyId: company.id,
          companyName: company.name,
          billingContactName: company.billingContactName,
          billingEmail: company.billingEmail,
          totalCents,
          orderCount: rows.length,
        },
      });
      const attached = await tx.order.updateMany({
        where: { id: { in: ids }, invoiceId: null, status: { in: ['CONFIRMED', 'DELIVERED'] } },
        data: { invoiceId: invoice.id, version: { increment: 1 } },
      });
      if (attached.count !== ids.length)
        throw new ApiException(
          HttpStatus.CONFLICT,
          'CONCURRENT_UPDATE',
          'An order was invoiced or changed concurrently. Refresh.',
        );
      await tx.orderEvent.createMany({
        data: ids.map((orderId) => ({
          orderId,
          type: 'INVOICED',
          description: `Added to ${invoiceNumber(invoice.sequence, invoice.issuedAt)}`,
          actorId: user.id,
        })),
      });
      return { id: invoice.id };
    });
  }
  async pay(id: string, version: number, user: SessionUser) {
    return this.orders.transaction(async (tx) => {
      const row = await tx.invoice.findUnique({ where: { id } });
      if (!row) throw ApiException.notFound('Invoice');
      requireVersion(row.version, version);
      if (row.paidAt)
        throw new ApiException(
          HttpStatus.CONFLICT,
          'INVOICE_ALREADY_PAID',
          'This invoice is already paid',
        );
      const result = await tx.invoice.updateMany({
        where: { id, version, paidAt: null },
        data: { paidAt: new Date(), version: { increment: 1 } },
      });
      if (result.count !== 1)
        throw new ApiException(
          HttpStatus.CONFLICT,
          'CONCURRENT_UPDATE',
          'This invoice changed. Refresh.',
        );
      const orders = await tx.order.findMany({ where: { invoiceId: id }, select: { id: true } });
      await tx.orderEvent.createMany({
        data: orders.map((o) => ({
          orderId: o.id,
          type: 'PAID',
          description: `${invoiceNumber(row.sequence, row.issuedAt)} marked paid in full`,
          actorId: user.id,
        })),
      });
      return { id };
    });
  }
  async reportShort(id: string, input: { version: number; note: string }, user: SessionUser) {
    return this.orders.transaction(async (tx) => {
      const row = await tx.order.findUnique({ where: { id } });
      if (!row) throw ApiException.notFound('Order');
      requireVersion(row.version, input.version);
      if (row.status !== 'DELIVERED')
        throw new ApiException(
          HttpStatus.CONFLICT,
          'ORDER_NOT_DELIVERED',
          'Only delivered orders can be reported short',
        );
      await tx.order.update({
        where: { id, version: input.version },
        data: {
          shortDeliveryNote: input.note,
          ...(row.invoiceId && { billingReviewReason: `Short delivery: ${input.note}` }),
          version: { increment: 1 },
        },
      });
      await this.orders.event(
        tx,
        id,
        'SHORT_REPORTED',
        `Short delivery reported: ${input.note}. Saved order/invoice amounts unchanged; staff review only.`,
        user.id,
      );
      return { id };
    });
  }
}
