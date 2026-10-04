import { Module } from '@nestjs/common';
import { DropMembershipModule } from '../drops/drop-membership.module.js';
import { MenuModule } from '../menu/menu.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [MenuModule, SettingsModule, DropMembershipModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
