import { Controller, Get } from '@nestjs/common';
import { KITCHEN_TIME_ZONE, kitchenToday } from '@fernleaf/shared';
import { Public } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Liveness check for deployment and for the web app's connection test. Public, no auth. */
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      database: 'ok',
      kitchenTimeZone: KITCHEN_TIME_ZONE,
      kitchenToday: kitchenToday(),
      serverTime: new Date().toISOString(),
    };
  }
}
