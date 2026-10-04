import { Module } from '@nestjs/common';
import { MenuModule } from '../menu/menu.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { DemoService } from './demo.service.js';
@Module({ imports: [MenuModule, SettingsModule], providers: [DemoService], exports: [DemoService] })
export class DemoModule {}
