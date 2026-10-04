import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  addDays,
  computeCutoff,
  demoRandom,
  demoStatus,
  demoWeekStart,
  demoWorkingDates,
  invoiceTotal,
  kitchenDateTimeToUtc,
  kitchenToday,
  snapshotLine,
  type KitchenCalendar,
  type LineSnapshot,
} from '@fernleaf/shared';
import { ApiException } from '../common/api-exception.js';
import { fromDbDate, toDbDate } from '../common/db-dates.js';
import { isTransactionConflict } from '../common/transaction-conflict.js';
import { Prisma } from '../generated/prisma/client.js';
import { MenuService } from '../menu/menu.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';

type PlannedOrder = {
  data: Prisma.OrderCreateManyInput;
  line: LineSnapshot;
  stage: 'WAITING' | 'KITCHEN_READY' | 'DISPATCH_READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
  driverId: string | null;
  group: string;
};
const key = (companyId: string, addressId: string, date: string, time: number) =>
  `${companyId}:${addressId}:${date}:${time}`;
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);
  private readonly covered = new Set<string>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly menus: MenuService,
    private readonly settings: SettingsService,
  ) {}
  async ensureCurrentWeek(now = new Date()) {
    if (process.env.DEMO_DATA_ENABLED === 'false') return { created: 0 };
    return this.ensureWeek(demoWeekStart(kitchenToday(now)), now);
  }
  async seedInitial(now = new Date()) {
    const current = demoWeekStart(kitchenToday(now));
    let created = 0;
    for (const offset of [-2, -1, 0, 1, 2, 3])
      created += (await this.ensureWeek(addDays(current, offset * 7), now)).created;
    return { created };
  }
  async ensureWeek(start: string, now = new Date()) {
    const begin = performance.now();
    start = demoWeekStart(start);
    if (this.covered.has(start)) return { created: 0 };
    if (await this.prisma.demoWeek.findUnique({ where: { startDate: toDbDate(start) } })) {
      this.covered.add(start);
      return { created: 0 };
    }
    const [settings, holidays, companies, drivers, stations] = await Promise.all([
      this.settings.get(),
      this.settings.listHolidays(),
      this.prisma.company.findMany({
        where: { isActive: true },
        include: {
          employees: { take: 2, orderBy: { email: 'asc' } },
          addresses: { where: { isDefault: true } },
          holidays: true,
          defaultPackagingType: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { isActive: true, role: { permissions: { has: 'deliveries.own' } } },
        select: { id: true, email: true },
      }),
      this.prisma.dish.findMany({
        select: { id: true, stationId: true, station: { select: { name: true } } },
      }),
    ]);
    const reviewer = drivers.find((d) => d.email === 'driver@test.com');
    const selected = companies
      .filter(
        (c) =>
          c.employees.length &&
          c.addresses.length &&
          c.defaultPackagingType.isActive &&
          c.defaultDeliveryTimeMinutes >= settings.deliveryWindowStartMinutes &&
          c.defaultDeliveryTimeMinutes <= settings.deliveryWindowEndMinutes,
      )
      .sort(
        (a, b) =>
          Number(b.defaultDriverId === reviewer?.id) - Number(a.defaultDriverId === reviewer?.id) ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 3);
    if (!selected.length) {
      this.logger.warn(
        'No eligible demo companies; run db:seed first. Existing data was not changed.',
      );
      return { created: 0 };
    }
    const kitchen: KitchenCalendar = { workingDays: settings.kitchenWorkingDays, holidays },
      today = kitchenToday(now);
    const plans: PlannedOrder[] = [];
    const menus = await Promise.all(
      selected.map((c) => this.menus.forEmployee(c.employees[0]!.id)),
    );
    for (const [companyIndex, company] of selected.entries()) {
      const address = company.addresses[0]!,
        menu = menus[companyIndex]!;
      const dishes = menu.categories
        .filter((c) => !/drinks|desserts/i.test(c.name))
        .flatMap((c) => c.dishes)
        .filter((d) => (d.minOrderQty ?? 1) <= 500);
      if (!dishes.length) continue;
      const random = demoRandom(`${start}:${company.id}`),
        calendar = {
          workingDays: company.workingDays,
          holidays: company.holidays.map((h) => ({
            startDate: fromDbDate(h.startDate),
            endDate: fromDbDate(h.endDate),
          })),
        };
      const dates = demoWorkingDates(start, kitchen, calendar);
      for (const [dayIndex, date] of dates.entries())
        for (const [employeeIndex, employee] of company.employees.entries()) {
          const cutoffAt = computeCutoff(
            date,
            { daysBefore: settings.cutoffDaysBefore, timeMinutes: settings.cutoffTimeMinutes },
            kitchen,
          );
          // Shared company visibility/tier; allergy/diet differences only warn, never filter dishes.
          const dish = dishes[Math.floor(random() * dishes.length)]!,
            quantity = Math.min(500, (dish.minOrderQty ?? 1) + Math.floor(random() * 2));
          const input = {
            menuItemId: dish.menuItemId,
            quantity,
            combinations: [
              {
                quantity,
                optionIds: dish.groups.flatMap((g) =>
                  g.options.slice(0, g.minSelect).map((o) => o.id),
                ),
              },
            ],
          };
          const line = snapshotLine(input, dish, 0, true),
            station = stations.find((s) => s.id === dish.dishId);
          line.stationId = station?.stationId ?? null;
          line.stationName = station?.station?.name ?? null;
          const variant = dayIndex + companyIndex + employeeIndex,
            status = demoStatus(
              date,
              today,
              cutoffAt,
              now,
              date < today ? dayIndex + companyIndex : variant,
            );
          const driverId = drivers.some((d) => d.id === company.defaultDriverId)
            ? company.defaultDriverId
            : (reviewer?.id ?? drivers[0]?.id ?? null);
          if (status === 'DELIVERED' && !driverId) continue;
          const stage =
            status === 'DELIVERED'
              ? 'DELIVERED'
              : date === today && status === 'CONFIRMED'
                ? companyIndex === 0 && driverId
                  ? 'OUT_FOR_DELIVERY'
                  : companyIndex === 1
                    ? 'KITCHEN_READY'
                    : 'WAITING'
                : 'WAITING';
          const delivery = kitchenDateTimeToUtc(date, company.defaultDeliveryTimeMinutes),
            dispatch = new Date(delivery.getTime() - company.dispatchLeadMinutes * 60000),
            ready = new Date(dispatch.getTime() - settings.kitchenReadyBufferMinutes * 60000);
          const createdAt = new Date(Math.min(now.getTime(), cutoffAt.getTime() - 3600000));
          plans.push({
            line,
            stage,
            driverId,
            group: key(company.id, address.id, date, company.defaultDeliveryTimeMinutes),
            data: {
              id: randomUUID(),
              employeeId: employee.id,
              employeeName: employee.name,
              companyId: company.id,
              companyName: company.name,
              deliveryDate: toDbDate(date),
              deliveryTimeMinutes: company.defaultDeliveryTimeMinutes,
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
              notes: '[Demo] Review example — editable by staff.',
              driverInstructions: company.driverInstructions,
              cutoffAt,
              dispatchLeadMinutes: company.dispatchLeadMinutes,
              kitchenBufferMinutes: settings.kitchenReadyBufferMinutes,
              plannedDispatchReadyAt: dispatch,
              plannedKitchenReadyAt: ready,
              status,
              totalCents: line.totalCents,
              createdAt,
              updatedAt: now,
            },
          });
        }
    }
    for (let attempt = 0; ; attempt++) {
      try {
        const created = await this.prisma.$transaction(
          async (tx) => {
            // Unique week claim and its rows commit together. Concurrent workers cannot see half a week.
            const claim = await tx.demoWeek.createMany({
              data: [{ startDate: toDbDate(start), orderCount: 0 }],
              skipDuplicates: true,
            });
            if (!claim.count) return 0;
            const [existing, existingDrops, closures] = await Promise.all([
              tx.order.findMany({
                where: {
                  employeeId: { in: plans.map((p) => p.data.employeeId) },
                  deliveryDate: { gte: toDbDate(start), lte: toDbDate(addDays(start, 6)) },
                },
                select: { employeeId: true, deliveryDate: true },
              }),
              tx.drop.findMany({
                where: {
                  companyId: { in: selected.map((c) => c.id) },
                  deliveryDate: { gte: toDbDate(start), lte: toDbDate(addDays(start, 6)) },
                },
                select: {
                  companyId: true,
                  addressId: true,
                  deliveryDate: true,
                  deliveryTimeMinutes: true,
                },
              }),
              tx.orderClosure.findMany({
                where: { deliveryDate: { gte: toDbDate(start), lte: toDbDate(addDays(start, 6)) } },
                select: { deliveryDate: true },
              }),
            ]);
            const closedDates = new Set(closures.map((c) => fromDbDate(c.deliveryDate)));
            const occupied = new Set(
                existing.map((o) => `${o.employeeId}:${fromDbDate(o.deliveryDate)}`),
              ),
              occupiedDrops = new Set(
                existingDrops.map((d) =>
                  key(d.companyId, d.addressId, fromDbDate(d.deliveryDate), d.deliveryTimeMinutes),
                ),
              );
            // Do not overwrite orders or add members to an existing reviewer-edited drop.
            const accepted = plans.filter(
              (p) =>
                !closedDates.has(fromDbDate(p.data.deliveryDate as Date)) &&
                !occupied.has(`${p.data.employeeId}:${fromDbDate(p.data.deliveryDate as Date)}`) &&
                !occupiedDrops.has(p.group),
            );
            const drops: Prisma.DropCreateManyInput[] = [],
              units: Prisma.PrepUnitCreateManyInput[] = [],
              lines: Prisma.OrderLineCreateManyInput[] = [],
              combos: Prisma.OrderCombinationCreateManyInput[] = [],
              events: Prisma.OrderEventCreateManyInput[] = [];
            const dropMap = new Map<string, Prisma.DropCreateManyInput>();
            for (const p of accepted) {
              const o = p.data,
                fulfilled = p.stage !== 'WAITING',
                stamp = (minutes: number) =>
                  new Date(
                    Math.min(
                      now.getTime() - minutes * 60000,
                      (o.plannedKitchenReadyAt as Date).getTime() - minutes * 60000,
                    ),
                  );
              const confirmedAt = new Date(Math.min(now.getTime(), (o.cutoffAt as Date).getTime()));
              const startedAt = fulfilled
                ? new Date(Math.max(confirmedAt.getTime(), stamp(40).getTime()))
                : null;
              const readyAt = fulfilled
                ? new Date(Math.max(startedAt!.getTime(), stamp(5).getTime()))
                : null;
              if (o.status === 'CONFIRMED' || o.status === 'DELIVERED') {
                let drop = dropMap.get(p.group);
                if (!drop) {
                  const dispatched =
                      p.stage === 'DISPATCH_READY' ||
                      p.stage === 'OUT_FOR_DELIVERY' ||
                      p.stage === 'DELIVERED',
                    out = p.stage === 'OUT_FOR_DELIVERY' || p.stage === 'DELIVERED',
                    delivered = p.stage === 'DELIVERED';
                  const at = new Date(
                    Math.max(
                      readyAt?.getTime() ?? confirmedAt.getTime(),
                      Math.min(now.getTime() - 60000, (o.plannedDispatchReadyAt as Date).getTime()),
                    ),
                  );
                  const deliveredAt = delivered
                    ? new Date(
                        Math.max(
                          at.getTime(),
                          Math.min(
                            now.getTime(),
                            kitchenDateTimeToUtc(
                              fromDbDate(o.deliveryDate as Date),
                              o.deliveryTimeMinutes,
                            ).getTime() +
                              (dayIndexForDate(fromDbDate(o.deliveryDate as Date)) % 2 ? 7 : -5) *
                                60000,
                          ),
                        ),
                      )
                    : null;
                  drop = {
                    id: randomUUID(),
                    companyId: o.companyId,
                    addressId: o.addressId!,
                    deliveryDate: o.deliveryDate,
                    deliveryTimeMinutes: o.deliveryTimeMinutes,
                    driverId: p.driverId,
                    status: delivered
                      ? 'DELIVERED'
                      : out
                        ? 'OUT_FOR_DELIVERY'
                        : dispatched
                          ? 'DISPATCH_READY'
                          : 'WAITING',
                    dispatchReadyAt: dispatched ? at : null,
                    outForDeliveryAt: out ? at : null,
                    deliveredAt,
                    deliveryNote: delivered ? '[Demo] Handed over at the office reception.' : '',
                    onTime: deliveredAt
                      ? deliveredAt <=
                        kitchenDateTimeToUtc(
                          fromDbDate(o.deliveryDate as Date),
                          o.deliveryTimeMinutes,
                        )
                      : null,
                    createdAt: o.createdAt,
                    updatedAt: now,
                  };
                  dropMap.set(p.group, drop);
                  drops.push(drop);
                }
                o.dropId = drop.id;
                o.kitchenStartedAt = startedAt;
                o.kitchenReadyAt = readyAt;
                o.outForDeliveryAt = drop.outForDeliveryAt;
              }
              const lineId = randomUUID(),
                snapshot = p.line;
              lines.push({
                id: lineId,
                orderId: o.id!,
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
                sortOrder: 0,
              });
              for (const [i, c] of snapshot.combinations.entries()) {
                const id = randomUUID();
                combos.push({ ...c, id, lineId, sortOrder: i });
                if (o.status === 'CONFIRMED' || o.status === 'DELIVERED')
                  units.push({
                    combinationId: id,
                    stationId: snapshot.stationId,
                    stationName: snapshot.stationName,
                    startedAt,
                    doneAt: readyAt,
                  });
              }
              events.push({
                orderId: o.id!,
                type: 'CREATED',
                description: '[Demo] Staff-created historical review example',
                at: o.createdAt,
              });
              if (o.status !== 'DRAFT')
                events.push({
                  orderId: o.id!,
                  type: 'PLACED',
                  description: '[Demo] Order placed',
                  at: o.createdAt,
                });
              if (o.status === 'CONFIRMED' || o.status === 'DELIVERED')
                events.push({
                  orderId: o.id!,
                  type: 'CONFIRMED',
                  description: '[Demo] Saved cut-off reached; order confirmed',
                  at: new Date(Math.min(now.getTime(), (o.cutoffAt as Date).getTime())),
                });
              if (readyAt)
                events.push({
                  orderId: o.id!,
                  type: 'KITCHEN_READY',
                  description: '[Demo] All saved prep units completed',
                  at: readyAt,
                });
              if (startedAt)
                events.push({
                  orderId: o.id!,
                  type: 'KITCHEN_STARTED',
                  description: '[Demo] Prep units started',
                  at: startedAt,
                });
              const assignedDrop = dropMap.get(p.group);
              if (assignedDrop?.dispatchReadyAt)
                events.push({
                  orderId: o.id!,
                  type: 'DISPATCH_READY',
                  description: '[Demo] All member orders ready for dispatch',
                  at: assignedDrop.dispatchReadyAt,
                });
              if (assignedDrop?.outForDeliveryAt)
                events.push({
                  orderId: o.id!,
                  type: 'OUT_FOR_DELIVERY',
                  description: '[Demo] Assigned driver departed',
                  at: assignedDrop.outForDeliveryAt,
                });
              if (o.status === 'DELIVERED')
                events.push({
                  orderId: o.id!,
                  type: 'DELIVERED',
                  description: '[Demo] Delivered to office reception',
                  at: dropMap.get(p.group)!.deliveredAt as Date,
                });
              if (o.status === 'CANCELLED' || o.status === 'REJECTED')
                events.push({
                  orderId: o.id!,
                  type: o.status,
                  description: '[Demo] Staff recorded a cancelled/rejected example',
                  at: new Date(Math.min(now.getTime(), (o.cutoffAt as Date).getTime())),
                });
            }
            // Historical invoices illustrate both paid and unpaid internal records, with exact full amounts.
            const invoices: Prisma.InvoiceCreateManyInput[] = [];
            for (const [i, c] of selected.entries()) {
              const members = accepted
                .filter(
                  (p) =>
                    p.data.companyId === c.id &&
                    p.data.status === 'DELIVERED' &&
                    fromDbDate(p.data.deliveryDate as Date) < today,
                )
                .slice(0, 2);
              if (!members.length) continue;
              const invoiceId = randomUUID(),
                issuedAt = new Date(now.getTime() - 3600000);
              invoices.push({
                id: invoiceId,
                companyId: c.id,
                companyName: c.name,
                billingContactName: c.billingContactName,
                billingEmail: c.billingEmail,
                totalCents: invoiceTotal(members.map((p) => p.data.totalCents)),
                orderCount: members.length,
                issuedAt,
                paidAt: i % 2 === 0 ? new Date(now.getTime() - 1800000) : null,
              });
              for (const p of members) {
                p.data.invoiceId = invoiceId;
                events.push({
                  orderId: p.data.id!,
                  type: 'INVOICED',
                  description: '[Demo] Added to internal historical invoice',
                  at: issuedAt,
                });
                if (i % 2 === 0)
                  events.push({
                    orderId: p.data.id!,
                    type: 'PAID',
                    description: '[Demo] Internal invoice recorded paid in full',
                    at: new Date(now.getTime() - 1800000),
                  });
              }
            }
            if (invoices.length) await tx.invoice.createMany({ data: invoices });
            if (drops.length) await tx.drop.createMany({ data: drops });
            if (accepted.length) await tx.order.createMany({ data: accepted.map((p) => p.data) });
            if (lines.length) await tx.orderLine.createMany({ data: lines });
            if (combos.length) await tx.orderCombination.createMany({ data: combos });
            if (units.length) await tx.prepUnit.createMany({ data: units });
            if (events.length) await tx.orderEvent.createMany({ data: events });
            await tx.demoWeek.update({
              where: { startDate: toDbDate(start) },
              data: { orderCount: accepted.length },
            });
            return accepted.length;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 },
        );
        this.covered.add(start);
        this.logger.log(
          `Demo coverage ${start}: ${created} new orders in ${Math.round(performance.now() - begin)} ms (existing records preserved)`,
        );
        return { created };
      } catch (e) {
        const conflict =
          isTransactionConflict(e) ||
          (typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002');
        if (conflict && attempt < 2) continue;
        if (conflict)
          throw new ApiException(
            HttpStatus.CONFLICT,
            'CONCURRENT_UPDATE',
            'Demo coverage changed concurrently. Refresh to load the completed week.',
          );
        throw e;
      }
    }
  }
}
function dayIndexForDate(date: string) {
  return Number(date.slice(-2));
}
