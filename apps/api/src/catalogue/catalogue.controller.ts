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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  DISH_IMAGE_MAX_BYTES,
  DishInputSchema,
  DishListQuerySchema,
  DishOptionGroupsSchema,
  OptionInputSchema,
  OptionListQuerySchema,
  type DishDetail,
  type DishListQuery,
  type DishOptionGroupsInput,
  type DishSummary,
  type OptionDetail,
  type OptionInput,
  type OptionListQuery,
  type OptionSummary,
  type Paginated,
  type SessionUser,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { CurrentUser, RequirePermission } from '../auth/decorators.js';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DishesService } from './dishes.service.js';
import { OptionsService } from './options.service.js';

/** Cost prices are internal: only staff who can see pricing get them (kitchen staff don't). */
const canSeeCost = (user: SessionUser) => user.permissions.includes('pricing.read');

@Controller('dishes')
export class DishesController {
  constructor(private readonly dishes: DishesService) {}

  @RequirePermission('catalogue.read')
  @Get()
  list(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(DishListQuerySchema)) query: DishListQuery,
  ): Promise<Paginated<DishSummary>> {
    return this.dishes.list(query, canSeeCost(user));
  }

  @RequirePermission('catalogue.read')
  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('id', ParseIdPipe) id: string): Promise<DishDetail> {
    return this.dishes.get(id, canSeeCost(user));
  }

  @RequirePermission('catalogue.manage')
  @Post()
  create(
    @Body(new ZodValidationPipe(DishInputSchema)) body: z.output<typeof DishInputSchema>,
  ): Promise<DishDetail> {
    return this.dishes.create(body);
  }

  /** Full update, including deactivation (dishes are never deleted). */
  @RequirePermission('catalogue.manage')
  @Put(':id')
  update(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(DishInputSchema)) body: z.output<typeof DishInputSchema>,
  ): Promise<DishDetail> {
    return this.dishes.update(id, body);
  }

  @RequirePermission('catalogue.manage')
  @Put(':id/option-groups')
  setOptionGroups(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(DishOptionGroupsSchema)) body: DishOptionGroupsInput,
  ): Promise<DishDetail> {
    return this.dishes.setOptionGroups(id, body);
  }

  /** multipart/form-data with an "image" field. Held in memory (≤ 2 MB), then sent to Vercel Blob. */
  @RequirePermission('catalogue.manage')
  @Post(':id/image')
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: DISH_IMAGE_MAX_BYTES, files: 1 } }),
  )
  setImage(
    @Param('id', ParseIdPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<DishDetail> {
    return this.dishes.setImage(id, file);
  }
}

@Controller('options')
export class OptionsController {
  constructor(private readonly options: OptionsService) {}

  @RequirePermission('catalogue.read')
  @Get()
  list(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(OptionListQuerySchema)) query: OptionListQuery,
  ): Promise<Paginated<OptionSummary>> {
    return this.options.list(query, canSeeCost(user));
  }

  @RequirePermission('catalogue.read')
  @Get(':id')
  get(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseIdPipe) id: string,
  ): Promise<OptionDetail> {
    return this.options.get(id, canSeeCost(user));
  }

  @RequirePermission('catalogue.manage')
  @Post()
  create(@Body(new ZodValidationPipe(OptionInputSchema)) body: OptionInput): Promise<OptionDetail> {
    return this.options.create(body);
  }

  @RequirePermission('catalogue.manage')
  @Put(':id')
  update(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(OptionInputSchema)) body: OptionInput,
  ): Promise<OptionDetail> {
    return this.options.update(id, body);
  }

  @RequirePermission('catalogue.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIdPipe) id: string): Promise<void> {
    return this.options.remove(id);
  }
}
