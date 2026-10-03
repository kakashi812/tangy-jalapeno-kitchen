import { parseTimeOfDay } from '@fernleaf/shared';
import { toDbDate } from '../common/db-dates.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { COMPANY_SEED } from './companies-data.js';

/** Creates the seeded companies (with domains, addresses and holidays) when missing, by name. */
export async function seedCompanies(prisma: PrismaClient): Promise<number> {
  for (const seed of COMPANY_SEED) {
    if (await prisma.company.findUnique({ where: { name: seed.name } })) continue;
    const [tier, packaging, driver] = await Promise.all([
      seed.tier ? prisma.priceTier.findUniqueOrThrow({ where: { name: seed.tier } }) : null,
      prisma.packagingType.findUniqueOrThrow({ where: { name: seed.packaging } }),
      seed.driver ? prisma.user.findUniqueOrThrow({ where: { email: seed.driver } }) : null,
    ]);
    await prisma.company.create({
      data: {
        name: seed.name,
        isActive: seed.isActive ?? true,
        priceTierId: tier?.id ?? null,
        billingContactName: seed.billing.name,
        billingEmail: seed.billing.email,
        billingPhone: seed.billing.phone,
        workingDays: seed.workingDays ?? [1, 2, 3, 4, 5],
        defaultDeliveryTimeMinutes: parseTimeOfDay(seed.deliveryTime),
        dispatchLeadMinutes: seed.dispatchLeadMinutes,
        defaultPackagingTypeId: packaging.id,
        driverInstructions: seed.driverInstructions,
        defaultDriverId: driver?.id ?? null,
        domains: { create: seed.domains.map((domain) => ({ domain })) },
        addresses: {
          create: seed.addresses.map((address, index) => ({
            ...address,
            line2: address.line2 ?? '',
            deliveryNotes: address.deliveryNotes ?? '',
            isDefault: index === 0,
          })),
        },
        holidays: {
          create: (seed.holidays ?? []).map((h) => ({
            name: h.name,
            startDate: toDbDate(h.startDate),
            endDate: toDbDate(h.endDate),
          })),
        },
      },
    });
  }
  return COMPANY_SEED.length;
}
