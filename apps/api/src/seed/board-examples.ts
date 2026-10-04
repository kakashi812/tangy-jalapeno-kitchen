import { randomUUID } from 'node:crypto';
import {
  addDays,
  computeCutoff,
  isKitchenWorkingDay,
  kitchenDateTimeToUtc,
  kitchenToday,
  snapshotLine,
  type LineSnapshot,
  type MenuDish,
} from '@fernleaf/shared';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { MenuService } from '../menu/menu.service.js';
import type { SettingsService } from '../settings/settings.service.js';
import { fromDbDate, toDbDate } from '../common/db-dates.js';
import { isTransactionConflict } from '../common/transaction-conflict.js';

export const BOARD_DEMO_PREFIX = '[Demo] Early-confirmed board example';

/** Choose one actually priced dish per station, using valid choices and minimum quantities. */
export function boardExampleLines(
  dishes: MenuDish[],
  stations: { id: string; stationId: string | null; station: { name: string } | null }[],
): LineSnapshot[] {
  const seen = new Set<string | null>();
  return dishes.flatMap((dish) => {
    const station = stations.find((s) => s.id === dish.dishId);
    const stationId = station?.stationId ?? null;
    if (seen.has(stationId) || (dish.minOrderQty ?? 1) > 500) return [];
    const quantity = Math.max(1, dish.minOrderQty ?? 1);
    const line = snapshotLine(
      {
        menuItemId: dish.menuItemId,
        quantity,
        combinations: [
          {
            quantity,
            optionIds: dish.groups.flatMap((g) => g.options.slice(0, g.minSelect).map((o) => o.id)),
          },
        ],
      },
      dish,
      seen.size,
      true,
    );
    seen.add(stationId);
    return [{ ...line, stationId, stationName: station?.station?.name ?? null }];
  });
}

/** Explicit seed only, never a normal order transition or a dashboard side effect.
 * Supplements regular Draft/Placed examples with clearly labelled early-confirmed fixtures.
 * Does not close dates, rewrite existing orders/drops, or reset cancelled demo examples.
 */
export async function seedBoardExamples(
  db: PrismaService,
  menus: MenuService,
  settingsService: SettingsService,
  now = new Date(),
) {
  const today = kitchenToday(now);
  const [settings, holidays, companies, users, stations] = await Promise.all([
    settingsService.get(),
    settingsService.listHolidays(),
    db.company.findMany({
      where: { isActive: true },
      include: {
        employees: { orderBy: { email: 'asc' } },
        addresses: { where: { isDefault: true } },
        holidays: true,
        defaultPackagingType: true,
      },
      orderBy: { name: 'asc' },
    }),
    db.user.findMany({ where: { isActive: true }, include: { role: true } }),
    db.dish.findMany({
      select: { id: true, stationId: true, station: { select: { name: true } } },
    }),
  ]);
  const kitchen = { workingDays: settings.kitchenWorkingDays, holidays };
  const reviewer = users.find(
    (u) => u.email === 'driver@test.com' && u.role.permissions.includes('deliveries.own'),
  );
  const cook = users.find(
    (u) => u.email === 'kitchen@test.com' && u.role.permissions.includes('kitchen.work'),
  );
  const selected = companies
    .filter((c) => c.employees.length > 2 && c.addresses.length && c.defaultPackagingType.isActive)
    .sort(
      (a, b) =>
        Number(b.defaultDriverId === reviewer?.id) - Number(a.defaultDriverId === reviewer?.id) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 3);
  const templates = await Promise.all(
    selected.map(async (company) => {
      const menu = await menus.forEmployee(company.employees[0]!.id);
      return {
        company,
        lines: boardExampleLines(
          menu.categories.flatMap((c) => c.dishes),
          stations,
        ),
      };
    }),
  );
  const createdAt = new Date(now.getTime() - 5 * 60000),
    confirmedAt = new Date(now.getTime() - 4 * 60000);
  const startedAt = new Date(now.getTime() - 3 * 60000),
    readyAt = new Date(now.getTime() - 2 * 60000);
  let created = 0;
  const coverage: { date: string; created: number }[] = [];
  for (let day = 0; day < 14; day++) {
    const date = addDays(today, day);
    if (!isKitchenWorkingDay(date, kitchen)) continue;
    for (let attempt = 0; ; attempt++) {
      try {
        const count = await db.$transaction(
          async (tx) => {
            const deliveryDate = toDbDate(date);
            if (await tx.orderClosure.findUnique({ where: { deliveryDate } })) return 0;
            const [existingOrders, existingDrops] = await Promise.all([
              tx.order.findMany({
                where: { deliveryDate, companyId: { in: selected.map((c) => c.id) } },
                select: {
                  employeeId: true,
                  companyId: true,
                  addressId: true,
                  deliveryTimeMinutes: true,
                  notes: true,
                  events: {
                    where: { type: 'CREATED', description: { startsWith: BOARD_DEMO_PREFIX } },
                    select: { id: true },
                  },
                },
              }),
              tx.drop.findMany({
                where: { deliveryDate, companyId: { in: selected.map((c) => c.id) } },
                select: { companyId: true, addressId: true, deliveryTimeMinutes: true },
              }),
            ]);
            const orders: Prisma.OrderCreateManyInput[] = [],
              drops: Prisma.DropCreateManyInput[] = [];
            const lines: Prisma.OrderLineCreateManyInput[] = [],
              combinations: Prisma.OrderCombinationCreateManyInput[] = [];
            const units: Prisma.PrepUnitCreateManyInput[] = [],
              events: Prisma.OrderEventCreateManyInput[] = [];
            for (const [index, template] of templates.entries()) {
              const { company, lines: snapshots } = template;
              if (
                !snapshots.length ||
                existingOrders.some((o) => o.companyId === company.id && o.events.length > 0)
              )
                continue;
              if (
                !isKitchenWorkingDay(date, {
                  workingDays: company.workingDays,
                  holidays: company.holidays.map((h) => ({
                    startDate: fromDbDate(h.startDate),
                    endDate: fromDbDate(h.endDate),
                  })),
                })
              )
                continue;
              // Prefer employees not used by the ordinary seed. Never reuse any occupied employee/date.
              const employee = company.employees
                .slice(2)
                .find((e) => !existingOrders.some((o) => o.employeeId === e.id));
              if (!employee) continue;
              const address = company.addresses[0]!;
              const occupied = [...existingOrders, ...existingDrops]
                .filter((o) => o.companyId === company.id && o.addressId === address.id)
                .map((o) => o.deliveryTimeMinutes);
              const slots = Array.from(
                {
                  length:
                    Math.floor(
                      (settings.deliveryWindowEndMinutes - settings.deliveryWindowStartMinutes) /
                        15,
                    ) + 1,
                },
                (_, i) => settings.deliveryWindowStartMinutes + i * 15,
              );
              slots.sort(
                (a, b) =>
                  Math.abs(a - company.defaultDeliveryTimeMinutes) -
                    Math.abs(b - company.defaultDeliveryTimeMinutes) || a - b,
              );
              const time = slots.find((m) => !occupied.includes(m));
              if (time === undefined) continue;
              const driver =
                users.find(
                  (u) =>
                    u.id === company.defaultDriverId &&
                    u.role.permissions.includes('deliveries.own'),
                ) ?? reviewer;
              if (!driver) continue;
              const state = (index + day) % 3; // Unstarted, in progress, kitchen-ready; never fake future departures.
              const orderId = randomUUID(),
                dropId = randomUUID();
              const delivery = kitchenDateTimeToUtc(date, time);
              const dispatch = new Date(delivery.getTime() - company.dispatchLeadMinutes * 60000);
              const ready = new Date(
                dispatch.getTime() - settings.kitchenReadyBufferMinutes * 60000,
              );
              drops.push({
                id: dropId,
                companyId: company.id,
                addressId: address.id,
                deliveryDate,
                deliveryTimeMinutes: time,
                driverId: driver.id,
                status: 'WAITING',
                createdAt,
                updatedAt: now,
              });
              orders.push({
                id: orderId,
                employeeId: employee.id,
                employeeName: employee.name,
                companyId: company.id,
                companyName: company.name,
                deliveryDate,
                deliveryTimeMinutes: time,
                addressId: address.id,
                addressText: [
                  address.label,
                  address.line1,
                  address.line2,
                  address.city,
                  address.postcode,
                  address.deliveryNotes,
                ]
                  .filter(Boolean)
                  .join(', '),
                packagingTypeId: company.defaultPackagingTypeId,
                packagingName: company.defaultPackagingType.name,
                notes: `${BOARD_DEMO_PREFIX} — sample prep ${state === 0 ? 'not started' : state === 1 ? 'in progress' : 'complete'}. Seeded before cutoff for reviewer demonstration; normal orders retain their cutoff rules.`,
                driverInstructions: company.driverInstructions,
                cutoffAt: computeCutoff(
                  date,
                  {
                    daysBefore: settings.cutoffDaysBefore,
                    timeMinutes: settings.cutoffTimeMinutes,
                  },
                  kitchen,
                ),
                dispatchLeadMinutes: company.dispatchLeadMinutes,
                kitchenBufferMinutes: settings.kitchenReadyBufferMinutes,
                plannedDispatchReadyAt: dispatch,
                plannedKitchenReadyAt: ready,
                status: 'CONFIRMED',
                totalCents: snapshots.reduce((sum, line) => sum + line.totalCents, 0),
                kitchenStartedAt: state > 0 ? startedAt : null,
                kitchenReadyAt: state === 2 ? readyAt : null,
                dropId,
                createdAt,
                updatedAt: now,
              });
              for (const [sortOrder, snapshot] of snapshots.entries()) {
                const lineId = randomUUID();
                lines.push({
                  id: lineId,
                  orderId,
                  menuItemId: snapshot.menuItemId,
                  dishId: snapshot.dishId,
                  name: snapshot.name,
                  sku: snapshot.sku,
                  temperature: snapshot.temperature,
                  stationId: snapshot.stationId,
                  stationName: snapshot.stationName,
                  minOrderQty: snapshot.minOrderQty,
                  quantity: snapshot.quantity,
                  dishPriceCents: snapshot.dishPriceCents,
                  groups: snapshot.groups,
                  totalCents: snapshot.totalCents,
                  sortOrder,
                });
                for (const [combinationIndex, combination] of snapshot.combinations.entries()) {
                  const id = randomUUID();
                  combinations.push({ ...combination, id, lineId, sortOrder: combinationIndex });
                  units.push({
                    combinationId: id,
                    stationId: snapshot.stationId,
                    stationName: snapshot.stationName,
                    startedAt: state > 0 ? startedAt : null,
                    doneAt: state === 2 ? readyAt : null,
                    startedById: state > 0 ? cook?.id : null,
                    doneById: state === 2 ? cook?.id : null,
                  });
                }
              }
              events.push(
                {
                  orderId,
                  type: 'CREATED',
                  description: `${BOARD_DEMO_PREFIX}: staff review fixture`,
                  at: createdAt,
                },
                {
                  orderId,
                  type: 'PLACED',
                  description: '[Demo] Priced from employee menu with valid selections',
                  at: createdAt,
                },
                {
                  orderId,
                  type: 'CONFIRMED',
                  description:
                    '[Demo] Explicit early-confirmed fixture, not automatic cutoff processing',
                  at: confirmedAt,
                },
              );
              if (state > 0)
                events.push({
                  orderId,
                  type: 'KITCHEN_STARTED',
                  description: '[Demo] Sample preparation started',
                  actorId: cook?.id,
                  at: startedAt,
                });
              if (state === 2)
                events.push({
                  orderId,
                  type: 'KITCHEN_READY',
                  description: '[Demo] All sample prep units completed',
                  actorId: cook?.id,
                  at: readyAt,
                });
            }
            if (!orders.length) return 0;
            await tx.drop.createMany({ data: drops });
            await tx.order.createMany({ data: orders });
            await tx.orderLine.createMany({ data: lines });
            await tx.orderCombination.createMany({ data: combinations });
            await tx.prepUnit.createMany({ data: units });
            await tx.orderEvent.createMany({ data: events });
            return orders.length;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 30000,
            timeout: 30000,
          },
        );
        created += count;
        coverage.push({ date, created: count });
        break;
      } catch (error) {
        const conflict =
          isTransactionConflict(error) ||
          (typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'P2002');
        if (conflict && attempt < 2) continue;
        throw error;
      }
    }
  }
  return { created, coverage };
}
