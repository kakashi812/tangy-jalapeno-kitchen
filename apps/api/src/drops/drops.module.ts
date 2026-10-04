import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { DeliveriesController, DropsController } from './drops.controller.js';
import { DropsService } from './drops.service.js';
@Module({
  imports: [OrdersModule],
  controllers: [DropsController, DeliveriesController],
  providers: [DropsService],
  exports: [DropsService],
})
export class DropsModule {}
