import { Module } from '@nestjs/common';
import { DishesController, OptionsController } from './catalogue.controller.js';
import { DishesService } from './dishes.service.js';
import { OptionsService } from './options.service.js';

@Module({
  controllers: [DishesController, OptionsController],
  providers: [DishesService, OptionsService],
  // Pricing and menus read dishes and options.
  exports: [DishesService, OptionsService],
})
export class CatalogueModule {}
