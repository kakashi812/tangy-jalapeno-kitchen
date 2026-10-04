import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client.js';
import { loadEnv } from '../config/env.js';
import { createAdapter } from './adapter.js';

/**
 * The single database client for the app, injected wherever data is needed.
 * On Neon it connects through Neon's serverless driver using the pooled URL, which suits short-lived
 * Vercel functions (many may run at once; the pooler shares a few real connections between them).
 * A local PostgreSQL (docker-compose) uses node-postgres instead; see ./adapter.ts.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: createAdapter(loadEnv().DATABASE_URL) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
