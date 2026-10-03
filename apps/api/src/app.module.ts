import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RolesModule } from './roles/roles.module.js';
import { StaffModule } from './staff/staff.module.js';

@Module({
  imports: [PrismaModule, AuthModule, StaffModule, RolesModule],
  controllers: [HealthController],
})
export class AppModule {}
