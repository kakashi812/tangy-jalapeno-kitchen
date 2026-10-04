import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { del, put } from '@vercel/blob';
import {
  deliveryOnTime,
  deliveryWindowRange,
  driverVisibleRange,
  dropState,
  kitchenDateTimeToUtc,
  kitchenToday,
  orderNumber,
  pageOffset,
  type DeliveryInput,
  type DeliveryWindow,
  type DropDetail,
  type DropQuery,
  type DropSummary,
  type Paginated,
  type SessionUser,
} from '@fernleaf/shared';
import { ApiException } from '../common/api-exception.js';
import { fromDbDate, toDbDate } from '../common/db-dates.js';
import { Prisma } from '../generated/prisma/client.js';
import { OrdersService } from '../orders/orders.service.js';
import { has, requireVersion } from '../orders/orders.policy.js';
import { PrismaService } from '../prisma/prisma.service.js';

const INCLUDE = {
  company: { select: { name: true } },
  driver: { select: { id: true, name: true, isActive: true } },
  orders: {
    take: 1,
    orderBy: { sequence: 'asc' },
    select: { addressText: true, companyName: true },
  },
  _count: { select: { orders: true } },
} as const satisfies Prisma.DropInclude;
type Row = Prisma.DropGetPayload<{ include: typeof INCLUDE }>;
function summary(row: Row, ready: number): DropSummary {
  return {
    id: row.id,
    version: row.version,
    company: { id: row.companyId, name: row.orders[0]?.companyName ?? row.company.name },
    addressText: row.orders[0]?.addressText ?? 'No orders',
    deliveryDate: fromDbDate(row.deliveryDate),
    deliveryTimeMinutes: row.deliveryTimeMinutes,
    state: dropState(row.status, row._count.orders, ready),
    driver: row.driver,
    orderCount: row._count.orders,
    readyOrderCount: ready,
    dispatchReadyAt: row.dispatchReadyAt?.toISOString() ?? null,
    outForDeliveryAt: row.outForDeliveryAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    deliveryNote: row.deliveryNote,
    photoUrl: row.photoUrl,
    onTime: row.onTime,
  };
}
/** Inclusive DATE range filter for a { from, to } pair of kitchen dates. */
const dateRange = ({ from, to }: { from: string; to: string }) =>
  from === to ? toDbDate(from) : { gte: toDbDate(from), lte: toDbDate(to) };
const conflict = (code: string, message: string) =>
  new ApiException(HttpStatus.CONFLICT, code, message);

@Injectable()
export class DropsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  /** Drivers may open their own drops across all three tabs; completing one stays today-only. */
  private scope(user: SessionUser): Prisma.DropWhereInput {
    return has(user, 'dispatch.view')
      ? {}
      : { driverId: user.id, deliveryDate: dateRange(driverVisibleRange(kitchenToday())) };
  }
  private async readyCounts(ids: string[]) {
    const rows = await this.prisma.order.groupBy({
      by: ['dropId'],
      where: { dropId: { in: ids }, kitchenReadyAt: { not: null } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.dropId, row._count._all]));
  }
  /** `own` is the driver's tab on their deliveries page; without it this is the dispatch board. */
  async list(
    query: DropQuery,
    user: SessionUser,
    own?: DeliveryWindow,
  ): Promise<Paginated<DropSummary>> {
    await this.orders.processDue();
    const state: Prisma.DropWhereInput =
      query.state === 'KITCHEN_READY'
        ? {
            status: 'WAITING',
            orders: { some: {}, every: { status: 'CONFIRMED', kitchenReadyAt: { not: null } } },
          }
        : query.state === 'WAITING'
          ? { status: 'WAITING', orders: { some: { kitchenReadyAt: null } } }
          : query.state
            ? { status: query.state }
            : {};
    const where: Prisma.DropWhereInput = own
      ? {
          driverId: user.id,
          deliveryDate: dateRange(deliveryWindowRange(own, kitchenToday())),
        }
      : !has(user, 'dispatch.view')
        ? { driverId: user.id, deliveryDate: toDbDate(kitchenToday()) }
        : {
            deliveryDate: toDbDate(query.deliveryDate ?? kitchenToday()),
            ...(query.companyId && { companyId: query.companyId }),
            ...(query.driverId && { driverId: query.driverId }),
            ...state,
          };
    const [rows, total] = await Promise.all([
      this.prisma.drop.findMany({
        where,
        include: INCLUDE,
        skip: pageOffset(query),
        take: query.pageSize,
        // Past deliveries read newest first; today and upcoming read in the order they happen.
        orderBy:
          own === 'past'
            ? [{ deliveryDate: 'desc' }, { deliveryTimeMinutes: 'desc' }, { id: 'asc' }]
            : [{ deliveryDate: 'asc' }, { deliveryTimeMinutes: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.drop.count({ where }),
    ]);
    const ready = await this.readyCounts(rows.map((row) => row.id));
    return {
      items: rows.map((row) => summary(row, ready.get(row.id) ?? 0)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
  async get(
    id: string,
    query: { page: number; pageSize: number },
    user: SessionUser,
  ): Promise<DropDetail> {
    await this.orders.processDue();
    const row = await this.prisma.drop.findFirst({
      where: { id, ...this.scope(user) },
      include: INCLUDE,
    });
    if (!row) throw ApiException.notFound('Drop');
    const [ready, orders] = await Promise.all([
      this.readyCounts([id]),
      this.prisma.order.findMany({
        where: { dropId: id },
        skip: pageOffset(query),
        take: query.pageSize,
        orderBy: { sequence: 'asc' },
        select: {
          id: true,
          sequence: true,
          employeeName: true,
          companyName: true,
          addressText: true,
          packagingName: true,
          notes: true,
          driverInstructions: true,
          kitchenReadyAt: true,
          lines: { select: { quantity: true } },
        },
      }),
    ]);
    return {
      ...summary(row, ready.get(id) ?? 0),
      canDeliver:
        has(user, 'deliveries.own') &&
        row.driverId === user.id &&
        fromDbDate(row.deliveryDate) === kitchenToday() &&
        row.status === 'OUT_FOR_DELIVERY',
      orders: {
        total: row._count.orders,
        page: query.page,
        pageSize: query.pageSize,
        items: orders.map((order) => ({
          id: order.id,
          number: orderNumber(order.sequence),
          employeeName: order.employeeName,
          companyName: order.companyName,
          addressText: order.addressText,
          packagingName: order.packagingName,
          notes: order.notes,
          driverInstructions: order.driverInstructions,
          kitchenReadyAt: order.kitchenReadyAt?.toISOString() ?? null,
          quantity: order.lines.reduce((sum, line) => sum + line.quantity, 0),
        })),
      },
    };
  }
  drivers() {
    return this.prisma.user.findMany({
      where: { isActive: true, role: { permissions: { has: 'deliveries.own' } } },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
  }
  private async lock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM drops WHERE id=${id}::uuid FOR UPDATE`;
    const row = await tx.drop.findUnique({ where: { id } });
    if (!row) throw ApiException.notFound('Drop');
    return row;
  }
  private async validDriver(tx: Prisma.TransactionClient, id: string) {
    const driver = await tx.user.findFirst({
      where: { id, isActive: true, role: { permissions: { has: 'deliveries.own' } } },
      select: { id: true, name: true },
    });
    if (!driver)
      throw ApiException.validation({
        driverId: ['Choose an active staff member with driver access'],
      });
    return driver;
  }
  async assign(id: string, version: number, driverId: string | null, user: SessionUser) {
    await this.orders.transaction(async (tx) => {
      const row = await this.lock(tx, id);
      requireVersion(row.version, version);
      if (['OUT_FOR_DELIVERY', 'DELIVERED'].includes(row.status))
        throw conflict('DROP_ALREADY_DEPARTED', 'Drivers can only be changed before departure');
      const driver = driverId ? await this.validDriver(tx, driverId) : null;
      if (row.driverId === driverId) return;
      await tx.drop.update({ where: { id }, data: { driverId, version: { increment: 1 } } });
      const members = await tx.order.findMany({ where: { dropId: id }, select: { id: true } });
      await tx.orderEvent.createMany({
        data: members.map((order) => ({
          orderId: order.id,
          type: 'DRIVER_ASSIGNED',
          description: driver ? `Driver assigned: ${driver.name}` : 'Driver unassigned',
          actorId: user.id,
        })),
      });
    });
    return { id };
  }
  async advance(id: string, version: number, action: 'ready' | 'depart', user: SessionUser) {
    await this.orders.transaction(async (tx) => {
      const row = await this.lock(tx, id);
      requireVersion(row.version, version);
      if (row.status !== (action === 'ready' ? 'WAITING' : 'DISPATCH_READY'))
        throw conflict(
          'INVALID_DROP_STEP',
          'This step is already complete or its previous step is missing. Refresh the drop.',
        );
      const members = await tx.order.findMany({
        where: { dropId: id },
        orderBy: { id: 'asc' },
        select: { id: true, status: true, kitchenReadyAt: true },
      });
      if (
        !members.length ||
        members.some((order) => order.status !== 'CONFIRMED' || !order.kitchenReadyAt)
      )
        throw conflict('KITCHEN_NOT_READY', 'Every order in this drop must be kitchen-ready first');
      const at = new Date();
      let driverName = '';
      if (action === 'depart') {
        if (!row.driverId) throw conflict('DRIVER_REQUIRED', 'Assign a driver before departure');
        driverName = (await this.validDriver(tx, row.driverId)).name;
        await tx.order.updateMany({
          where: { dropId: id },
          data: { outForDeliveryAt: at, version: { increment: 1 } },
        });
      }
      await tx.drop.update({
        where: { id },
        data: {
          status: action === 'ready' ? 'DISPATCH_READY' : 'OUT_FOR_DELIVERY',
          ...(action === 'ready' ? { dispatchReadyAt: at } : { outForDeliveryAt: at }),
          version: { increment: 1 },
        },
      });
      await tx.orderEvent.createMany({
        data: members.map((order) => ({
          orderId: order.id,
          type: action === 'ready' ? 'DISPATCH_READY' : 'OUT_FOR_DELIVERY',
          description:
            action === 'ready'
              ? 'Entire drop marked dispatch-ready'
              : `Drop departed with ${driverName}`,
          actorId: user.id,
        })),
      });
    });
    return { id };
  }
  private assertOwn(
    row: { driverId: string | null; deliveryDate: Date; status: string },
    user: SessionUser,
  ) {
    if (row.driverId !== user.id || fromDbDate(row.deliveryDate) !== kitchenToday())
      throw ApiException.notFound('Delivery');
    if (row.status !== 'OUT_FOR_DELIVERY')
      throw conflict(
        'DELIVERY_NOT_OUT',
        'Only a drop that is out for delivery can be marked delivered',
      );
  }
  async deliver(id: string, input: DeliveryInput, user: SessionUser, file?: Express.Multer.File) {
    // Check ownership/state/version before external upload, then recheck atomically before completing.
    const current = await this.prisma.drop.findUnique({ where: { id } });
    if (!current) throw ApiException.notFound('Delivery');
    this.assertOwn(current, user);
    requireVersion(current.version, input.version);
    let photoUrl: string | null = null;
    if (file) {
      if (file.size > 2 * 1024 * 1024)
        throw ApiException.validation({ photo: ['The photo must be 2 MB or smaller'] });
      const extension =
        file.mimetype === 'image/jpeg'
          ? 'jpg'
          : file.mimetype === 'image/png'
            ? 'png'
            : file.mimetype === 'image/webp'
              ? 'webp'
              : null;
      const signature = file.buffer;
      const valid =
        extension === 'jpg'
          ? signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff
          : extension === 'png'
            ? signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : extension === 'webp'
              ? signature.toString('ascii', 0, 4) === 'RIFF' &&
                signature.toString('ascii', 8, 12) === 'WEBP'
              : false;
      if (!valid)
        throw ApiException.validation({ photo: ['Choose a valid JPEG, PNG or WebP photo'] });
      if (!process.env.BLOB_READ_WRITE_TOKEN)
        throw new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE,
          'PHOTO_STORAGE_UNAVAILABLE',
          'Photo storage is not configured. Submit without a photo or ask an admin to configure it.',
        );
      photoUrl = (
        await put(`deliveries/${id}-${randomUUID()}.${extension}`, file.buffer, {
          access: 'public',
          contentType: file.mimetype,
          addRandomSuffix: false,
        })
      ).url;
    }
    try {
      await this.orders.transaction(async (tx) => {
        const row = await this.lock(tx, id);
        this.assertOwn(row, user);
        requireVersion(row.version, input.version);
        const at = new Date(),
          onTime = deliveryOnTime(
            at,
            kitchenDateTimeToUtc(fromDbDate(row.deliveryDate), row.deliveryTimeMinutes),
          );
        const members = await tx.order.findMany({
          where: { dropId: id },
          select: { id: true, status: true },
        });
        if (!members.length || members.some((order) => order.status !== 'CONFIRMED'))
          throw conflict(
            'INVALID_DROP_ORDERS',
            'The drop changed. Refresh before completing delivery.',
          );
        await tx.drop.update({
          where: { id },
          data: {
            status: 'DELIVERED',
            deliveredAt: at,
            onTime,
            deliveryNote: input.note,
            photoUrl,
            version: { increment: 1 },
          },
        });
        await tx.order.updateMany({
          where: { dropId: id },
          data: { status: 'DELIVERED', version: { increment: 1 } },
        });
        await tx.orderEvent.createMany({
          data: members.map((order) => ({
            orderId: order.id,
            type: 'DELIVERED',
            description: `Drop delivered ${onTime ? 'on time' : 'late'}${input.note ? `: ${input.note}` : ''}${photoUrl ? ' (photo attached)' : ''}`,
            actorId: user.id,
          })),
        });
      });
    } catch (error) {
      if (photoUrl) {
        try {
          await del(photoUrl);
        } catch {
          console.error('Could not clean up an unused delivery photo');
        }
      }
      throw error;
    }
    return { id };
  }
}
