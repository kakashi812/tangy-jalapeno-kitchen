import { Module } from '@nestjs/common';
import { ItemPricesController, PriceTiersController } from './pricing.controller.js';
import { PricingService } from './pricing.service.js';

@Module({
  controllers: [PriceTiersController, ItemPricesController],
  providers: [PricingService],
  // Menus and orders resolve prices through this service.
  exports: [PricingService],
})
export class PricingModule {}
