import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
@Module({
  imports: [OrdersModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
