import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../generated/prisma/client.js';
import { loadEnv } from '../config/env.js';

/**
 * The single database client for the app, injected wherever data is needed.
 * It connects through Neon's serverless driver using the pooled URL, which suits short-lived
 * Vercel functions (many may run at once; the pooler shares a few real connections between them).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaNeon({ connectionString: loadEnv().DATABASE_URL }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
