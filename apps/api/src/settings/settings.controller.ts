import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  CutoffPreviewQuerySchema,
  HolidayInputSchema,
  SettingsSchema,
  type CutoffPreviewDay,
  type HolidayInput,
  type KitchenHoliday,
  type Settings,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { RequirePermission, SignedIn } from '../auth/decorators.js';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SettingsService } from './settings.service.js';

/** Settings are readable by any signed-in staff (boards need the timings); only admins change them. */
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @SignedIn()
  @Get()
  get(): Promise<Settings> {
    return this.settings.get();
  }

  @RequirePermission('settings.manage')
  @Put()
  update(@Body(new ZodValidationPipe(SettingsSchema)) body: Settings): Promise<Settings> {
    return this.settings.update(body);
  }

  /** "Orders for Wed 7 Oct lock at Mon 5 Oct 16:00" for the next N days, under the current rules. */
  @SignedIn()
  @Get('cutoffs')
  cutoffs(
    @Query(new ZodValidationPipe(CutoffPreviewQuerySchema))
    query: z.infer<typeof CutoffPreviewQuerySchema>,
  ): Promise<CutoffPreviewDay[]> {
    return this.settings.cutoffPreview(query.from, query.days);
  }
}

@Controller('kitchen-holidays')
export class KitchenHolidaysController {
  constructor(private readonly settings: SettingsService) {}

  @SignedIn()
  @Get()
  list(): Promise<KitchenHoliday[]> {
    return this.settings.listHolidays();
  }

  @RequirePermission('settings.manage')
  @Post()
  create(
    @Body(new ZodValidationPipe(HolidayInputSchema)) body: HolidayInput,
  ): Promise<KitchenHoliday> {
    return this.settings.createHoliday(body);
  }

  @RequirePermission('settings.manage')
  @Put(':id')
  update(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(HolidayInputSchema)) body: HolidayInput,
  ): Promise<KitchenHoliday> {
    return this.settings.updateHoliday(id, body);
  }

  @RequirePermission('settings.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIdPipe) id: string): Promise<void> {
    return this.settings.deleteHoliday(id);
  }
}
