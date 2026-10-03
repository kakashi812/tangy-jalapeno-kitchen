import { existsSync } from 'node:fs';
import { DEFAULT_SETTINGS } from '@fernleaf/shared';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../generated/prisma/client.js';
import { hashPassword } from '../auth/password.js';
import { toDbDate } from '../common/db-dates.js';
import { HOLIDAY_SEED, REFERENCE_SEED } from './reference-data.js';
import { DEFAULT_ROLES } from './roles.js';

/**
 * Creates or restores the base data. Safe to run any number of times.
 * - Roles and staff accounts are upserted by name and email and **restored**: a run after someone
 *   edited the test accounts on the live app puts them back (password Test@1234, role, active).
 * - Settings, reference lists and kitchen holidays are only **created when missing**, so an
 *   admin's edits in the panel survive.
 *
 *   pnpm --filter @fernleaf/api db:seed
 */
const TEST_PASSWORD = 'Test@1234';

const STAFF = [
  { email: 'admin@test.com', name: 'Asha Menon', role: 'Admin' },
  { email: 'kitchen@test.com', name: 'Karan Patel', role: 'Kitchen' },
  { email: 'dispatch@test.com', name: 'Divya Rao', role: 'Dispatch' },
  { email: 'driver@test.com', name: 'Dev Singh', role: 'Driver' },
  // Extra drivers so dispatch has a real choice when assigning drops.
  { email: 'ravi.driver@test.com', name: 'Ravi Kumar', role: 'Driver' },
  { email: 'meera.driver@test.com', name: 'Meera Joshi', role: 'Driver' },
];

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

  try {
    const roleIds = new Map<string, string>();
    for (const role of DEFAULT_ROLES) {
      const saved = await prisma.role.upsert({
        where: { name: role.name },
        create: role,
        update: {
          description: role.description,
          isSystem: role.isSystem,
          permissions: role.permissions,
        },
      });
      roleIds.set(role.name, saved.id);
    }

    const passwordHash = await hashPassword(TEST_PASSWORD);
    for (const member of STAFF) {
      const roleId = roleIds.get(member.role);
      if (!roleId) throw new Error(`Unknown role ${member.role}`);
      await prisma.user.upsert({
        where: { email: member.email },
        create: { email: member.email, name: member.name, passwordHash, roleId },
        update: { name: member.name, passwordHash, roleId, isActive: true },
      });
    }

    // Settings, reference lists and holidays are only created when missing: an admin's later
    // edits in the panel survive a re-seed.
    await prisma.platformSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...DEFAULT_SETTINGS },
      update: {},
    });

    const tables = {
      allergens: prisma.allergen,
      'dietary-tags': prisma.dietaryTag,
      stations: prisma.kitchenStation,
      'portion-sizes': prisma.portionSize,
      'packaging-types': prisma.packagingType,
    };
    for (const [kind, names] of Object.entries(REFERENCE_SEED) as [
      keyof typeof tables,
      string[],
    ][]) {
      const table = tables[kind] as unknown as {
        upsert(args: {
          where: { name: string };
          create: { name: string; sortOrder: number };
          update: Record<string, never>;
        }): Promise<unknown>;
      };
      for (const [index, name] of names.entries()) {
        await table.upsert({
          where: { name },
          create: { name, sortOrder: index * 10 },
          update: {},
        });
      }
    }

    for (const holiday of HOLIDAY_SEED) {
      const exists = await prisma.kitchenHoliday.findFirst({ where: { name: holiday.name } });
      if (!exists) {
        await prisma.kitchenHoliday.create({
          data: {
            name: holiday.name,
            startDate: toDbDate(holiday.startDate),
            endDate: toDbDate(holiday.endDate),
          },
        });
      }
    }

    console.log(
      `Seeded ${DEFAULT_ROLES.length} roles, ${STAFF.length} staff accounts, settings, reference lists and ${HOLIDAY_SEED.length} kitchen holidays.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
