import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { KitchenController } from './kitchen.controller.js';
import { KitchenService } from './kitchen.service.js';
@Module({
  imports: [OrdersModule, SettingsModule],
  controllers: [KitchenController],
  providers: [KitchenService],
  exports: [KitchenService],
})
export class KitchenModule {}
