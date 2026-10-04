import { existsSync } from 'node:fs';
import { PrismaClient } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { createAdapter } from '../prisma/adapter.js';
import { DemoService } from '../demo/demo.service.js';
import { MenuService } from '../menu/menu.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import { SettingsService } from '../settings/settings.service.js';
if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const prisma = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });
try {
  const client = prisma as PrismaService;
  const demo = new DemoService(
    client,
    new MenuService(client, new PricingService(client)),
    new SettingsService(client),
  );
  const result = await demo.seedInitial();
  console.log(
    `Appended ${result.created} operational demo orders. Existing orders, staff and configuration were not reset.`,
  );
} finally {
  await prisma.$disconnect();
}
