import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module.js';
import { MenuController } from './menu.controller.js';
import { MenuService } from './menu.service.js';

@Module({
  imports: [PricingModule],
  controllers: [MenuController],
  providers: [MenuService],
  // Orders validate against the same menu the preview shows.
  exports: [MenuService],
})
export class MenuModule {}
