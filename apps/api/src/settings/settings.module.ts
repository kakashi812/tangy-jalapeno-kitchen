import { Module } from '@nestjs/common';
import { KitchenHolidaysController, SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

@Module({
  controllers: [SettingsController, KitchenHolidaysController],
  providers: [SettingsService],
  // Orders (cut-off) and the kitchen board (timings) use the settings and calendar.
  exports: [SettingsService],
})
export class SettingsModule {}
