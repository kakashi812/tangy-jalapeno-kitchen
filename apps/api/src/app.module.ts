import { Module } from '@nestjs/common';
import { DropsModule } from './drops/drops.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogueModule } from './catalogue/catalogue.module.js';
import { CompaniesModule } from './companies/companies.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { MenuModule } from './menu/menu.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { KitchenModule } from './kitchen/kitchen.module.js';
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
    EmployeesModule,
    MenuModule,
    OrdersModule,
    KitchenModule,
    DropsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
