import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Locally the URLs come from apps/api/.env; on Vercel they are real environment variables.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // The CLI (migrations) uses the direct connection: Neon's pooler (PgBouncer) can't run migrations.
  // The running app uses the pooled DATABASE_URL through the Neon adapter (src/prisma/prisma.service.ts).
  // Read without env() so `prisma generate` (run on every install) works without a database URL;
  // migrate commands still fail with a clear error when it is missing.
  datasource: { url: process.env.DATABASE_URL_UNPOOLED },
});
