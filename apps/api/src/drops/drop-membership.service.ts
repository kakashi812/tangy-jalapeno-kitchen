import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException } from '../common/api-exception.js';
import { Prisma } from '../generated/prisma/client.js';

/** Called inside the order transaction, never starts a separate transaction. */
@Injectable()
export class DropMembershipService {
  /** Cutoff batches must not perform several remote queries for each of 100 orders. */
  async confirmBatch(tx: Prisma.TransactionClient, orderIds: string[]) {
    if (!orderIds.length) return;
    const ids = Prisma.join(orderIds.map((id) => Prisma.sql`${id}::uuid`));
    const targets = await tx.$queryRaw<{ id: string; status: string }[]>`
      SELECT d.id, d.status FROM drops d WHERE d.id IN (
        SELECT existing.id FROM orders o JOIN drops existing ON existing."companyId"=o."companyId"
          AND existing."addressId"=o."addressId" AND existing."deliveryDate"=o."deliveryDate"
          AND existing."deliveryTimeMinutes"=o."deliveryTimeMinutes"
        WHERE o.id IN (${ids}) AND o.status='CONFIRMED' AND o."dropId" IS NULL
      ) ORDER BY d.id FOR UPDATE
    `;
    if (targets.some((drop) => ['OUT_FOR_DELIVERY', 'DELIVERED'].includes(drop.status)))
      throw new ApiException(
        HttpStatus.CONFLICT,
        'DROP_ALREADY_DEPARTED',
        'A pending order would join a departed drop. An admin must choose a different address/time.',
      );
    await tx.$executeRaw`
      INSERT INTO drops (id,"companyId","addressId","deliveryDate","deliveryTimeMinutes","driverId","updatedAt")
      SELECT gen_random_uuid(), grouped."companyId", grouped."addressId", grouped."deliveryDate", grouped."deliveryTimeMinutes",
        CASE WHEN u."isActive" AND 'deliveries.own'=ANY(r.permissions) THEN c."defaultDriverId" ELSE NULL END, CURRENT_TIMESTAMP
      FROM (SELECT DISTINCT "companyId","addressId","deliveryDate","deliveryTimeMinutes" FROM orders
        WHERE id IN (${ids}) AND status='CONFIRMED' AND "dropId" IS NULL) grouped
      JOIN companies c ON c.id=grouped."companyId" LEFT JOIN users u ON u.id=c."defaultDriverId" LEFT JOIN roles r ON r.id=u."roleId"
      ON CONFLICT ("companyId","addressId","deliveryDate","deliveryTimeMinutes") DO NOTHING
    `;
    await tx.$executeRaw`
      UPDATE drops d SET status='WAITING', "dispatchReadyAt"=NULL, version=d.version+1, "updatedAt"=CURRENT_TIMESTAMP
      WHERE d.id IN (SELECT target.id FROM orders o JOIN drops target ON target."companyId"=o."companyId"
        AND target."addressId"=o."addressId" AND target."deliveryDate"=o."deliveryDate" AND target."deliveryTimeMinutes"=o."deliveryTimeMinutes"
        WHERE o.id IN (${ids}) AND o.status='CONFIRMED' AND o."dropId" IS NULL)
    `;
    await tx.$executeRaw`
      UPDATE orders o SET "dropId"=d.id FROM drops d WHERE o.id IN (${ids}) AND o.status='CONFIRMED' AND o."dropId" IS NULL
        AND d."companyId"=o."companyId" AND d."addressId"=o."addressId" AND d."deliveryDate"=o."deliveryDate" AND d."deliveryTimeMinutes"=o."deliveryTimeMinutes"
    `;
    const reopened = targets
      .filter((drop) => drop.status === 'DISPATCH_READY')
      .map((drop) => Prisma.sql`${drop.id}::uuid`);
    if (reopened.length)
      await tx.$executeRaw`
      INSERT INTO order_events (id,"orderId",type,description)
      SELECT gen_random_uuid(),id,'DISPATCH_REOPENED','A new order joined this drop; dispatch readiness must be checked again. Assigned driver retained.'
      FROM orders WHERE "dropId" IN (${Prisma.join(reopened)})
    `;
  }

  async sync(tx: Prisma.TransactionClient, orderId: string) {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status !== 'CONFIRMED') {
      if (order.dropId && order.status !== 'DELIVERED') {
        await tx.order.update({ where: { id: orderId }, data: { dropId: null } });
        await this.removeMember(tx, order.dropId);
      }
      return;
    }
    const key = {
      companyId: order.companyId,
      addressId: order.addressId,
      deliveryDate: order.deliveryDate,
      deliveryTimeMinutes: order.deliveryTimeMinutes,
    };
    let target = await tx.drop.findUnique({
      where: { companyId_addressId_deliveryDate_deliveryTimeMinutes: key },
    });
    if (target?.id === order.dropId) return;
    if (target && ['OUT_FOR_DELIVERY', 'DELIVERED'].includes(target.status))
      throw new ApiException(
        HttpStatus.CONFLICT,
        'DROP_ALREADY_DEPARTED',
        'This address/time belongs to a drop that has already departed. Choose another address or time.',
      );
    if (!target) {
      const company = await tx.company.findUniqueOrThrow({
        where: { id: order.companyId },
        select: {
          defaultDriver: {
            select: { id: true, isActive: true, role: { select: { permissions: true } } },
          },
        },
      });
      const driver = company.defaultDriver;
      target = await tx.drop.upsert({
        where: { companyId_addressId_deliveryDate_deliveryTimeMinutes: key },
        create: {
          ...key,
          driverId:
            driver?.isActive && driver.role.permissions.includes('deliveries.own')
              ? driver.id
              : null,
        },
        update: {},
      });
      if (['OUT_FOR_DELIVERY', 'DELIVERED'].includes(target.status))
        throw new ApiException(
          HttpStatus.CONFLICT,
          'DROP_ALREADY_DEPARTED',
          'The destination drop has already departed. Refresh and choose another time.',
        );
    }
    await tx.drop.update({
      where: { id: target.id },
      data: { status: 'WAITING', dispatchReadyAt: null, version: { increment: 1 } },
    });
    await tx.order.update({ where: { id: orderId }, data: { dropId: target.id } });
    if (target.status === 'DISPATCH_READY') {
      const members = await tx.order.findMany({
        where: { dropId: target.id },
        select: { id: true },
      });
      await tx.orderEvent.createMany({
        data: members.map((member) => ({
          orderId: member.id,
          type: 'DISPATCH_REOPENED',
          description:
            'A new order joined this drop; dispatch readiness must be checked again. Assigned driver retained.',
        })),
      });
    }
    if (order.dropId) await this.removeMember(tx, order.dropId);
  }

  private async removeMember(tx: Prisma.TransactionClient, dropId: string) {
    if (await tx.order.count({ where: { dropId } }))
      await tx.drop.update({ where: { id: dropId }, data: { version: { increment: 1 } } });
    else await tx.drop.delete({ where: { id: dropId } });
  }
}
