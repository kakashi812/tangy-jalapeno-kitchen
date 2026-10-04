import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  KitchenQuerySchema,
  OrderActionSchema,
  type KitchenQuery,
  type SessionUser,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { CurrentUser, RequirePermission } from '../auth/decorators.js';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { KitchenService } from './kitchen.service.js';
@Controller('kitchen')
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}
  @Get()
  @RequirePermission('kitchen.view')
  board(@Query(new ZodValidationPipe(KitchenQuerySchema)) query: KitchenQuery) {
    return this.kitchen.board(query);
  }
  @Post('units/:id/start')
  @RequirePermission('kitchen.work')
  start(@Param('id', ParseIdPipe) id: string, @CurrentUser() user: SessionUser) {
    return this.kitchen.work(id, 'start', user);
  }
  @Post('units/:id/done')
  @RequirePermission('kitchen.work')
  done(@Param('id', ParseIdPipe) id: string, @CurrentUser() user: SessionUser) {
    return this.kitchen.work(id, 'done', user);
  }
  @Post('orders/:id/force-complete')
  @RequirePermission('kitchen.forceComplete')
  force(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(OrderActionSchema)) body: z.infer<typeof OrderActionSchema>,
    @CurrentUser() user: SessionUser,
  ) {
    return this.kitchen.forceComplete(id, body.version, body.reason, user);
  }
}
