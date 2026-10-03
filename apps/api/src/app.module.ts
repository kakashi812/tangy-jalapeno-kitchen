import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { CatalogueModule } from './catalogue/catalogue.module.js';
import { CompaniesModule } from './companies/companies.module.js';
import { HealthController } from './health/health.controller.js';
import { PricingModule } from './pricing/pricing.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ReferenceModule } from './reference/reference.module.js';
import { RolesModule } from './roles/roles.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { StaffModule } from './staff/staff.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    StaffModule,
    RolesModule,
    SettingsModule,
    ReferenceModule,
    CatalogueModule,
    PricingModule,
    CompaniesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
