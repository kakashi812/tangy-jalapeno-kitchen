import { existsSync } from 'node:fs';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../generated/prisma/client.js';
import { hashPassword } from '../auth/password.js';
import { DEFAULT_ROLES } from './roles.js';

/**
 * Creates or restores the roles and staff accounts. Safe to run any number of times: it upserts by
 * name and email, so a second run changes nothing, and a run after someone edited the test accounts
 * on the live app puts them back (password Test@1234, original role, active).
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

    console.log(`Seeded ${DEFAULT_ROLES.length} roles and ${STAFF.length} staff accounts.`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
