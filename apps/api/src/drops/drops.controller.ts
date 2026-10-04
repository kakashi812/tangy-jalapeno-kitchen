import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  DELIVERY_PHOTO_MAX_BYTES,
  DeliveryInputSchema,
  DropActionSchema,
  DropAssignmentSchema,
  DropQuerySchema,
  PageQuerySchema,
  type DeliveryInput,
  type DropQuery,
  type SessionUser,
} from '@fernleaf/shared';
import { CurrentUser, RequireAnyPermission, RequirePermission } from '../auth/decorators.js';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DropsService } from './drops.service.js';
import type { z } from 'zod';

@Controller('drops')
export class DropsController {
  constructor(private readonly drops: DropsService) {}
  @Get()
  @RequirePermission('dispatch.view')
  list(
    @Query(new ZodValidationPipe(DropQuerySchema)) query: DropQuery,
    @CurrentUser() user: SessionUser,
  ) {
    return this.drops.list(query, user);
  }
  @Get('drivers')
  @RequirePermission('drops.assign')
  drivers() {
    return this.drops.drivers();
  }
  @Get(':id')
  @RequireAnyPermission('dispatch.view', 'deliveries.own')
  get(
    @Param('id', ParseIdPipe) id: string,
    @Query(new ZodValidationPipe(PageQuerySchema)) query: z.infer<typeof PageQuerySchema>,
    @CurrentUser() user: SessionUser,
  ) {
    return this.drops.get(id, query, user);
  }
  @Put(':id/driver')
  @RequirePermission('drops.assign')
  assign(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(DropAssignmentSchema)) body: z.infer<typeof DropAssignmentSchema>,
    @CurrentUser() user: SessionUser,
  ) {
    return this.drops.assign(id, body.version, body.driverId, user);
  }
  @Post(':id/ready')
  @RequirePermission('drops.advance')
  ready(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(DropActionSchema)) body: z.infer<typeof DropActionSchema>,
    @CurrentUser() user: SessionUser,
  ) {
    return this.drops.advance(id, body.version, 'ready', user);
  }
  @Post(':id/depart')
  @RequirePermission('drops.advance')
  depart(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(DropActionSchema)) body: z.infer<typeof DropActionSchema>,
    @CurrentUser() user: SessionUser,
  ) {
    return this.drops.advance(id, body.version, 'depart', user);
  }
}
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly drops: DropsService) {}
  @Get()
  @RequirePermission('deliveries.own')
  list(
    @Query(new ZodValidationPipe(DropQuerySchema)) query: DropQuery,
    @CurrentUser() user: SessionUser,
  ) {
    return this.drops.list(query, user, true);
  }
  @Post(':id/deliver')
  @RequirePermission('deliveries.own')
  @UseInterceptors(
    FileInterceptor('photo', { limits: { fileSize: DELIVERY_PHOTO_MAX_BYTES, files: 1 } }),
  )
  deliver(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(DeliveryInputSchema)) body: DeliveryInput,
    @CurrentUser() user: SessionUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.drops.deliver(id, body, user, file);
  }
}
