import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { KitchenModule } from '../kitchen/kitchen.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
@Module({
  imports: [OrdersModule, KitchenModule, SettingsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
