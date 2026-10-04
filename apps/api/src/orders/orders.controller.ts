import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import {
  CloseOrdersSchema,
  OrderActionSchema,
  OrderContextQuerySchema,
  OrderEmployeeQuerySchema,
  OrderInputSchema,
  OrderListQuerySchema,
  OrderOverrideSchema,
  type OrderInput,
  type OrderListQuery,
  type SessionUser,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { CurrentUser, Public, RequirePermission } from '../auth/decorators.js';
import { ApiException } from '../common/api-exception.js';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { OrdersService } from './orders.service.js';

@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('orders')
  @RequirePermission('orders.read')
  list(
    @Query(new ZodValidationPipe(OrderListQuerySchema)) query: OrderListQuery,
    @CurrentUser() user: SessionUser,
  ) {
    return this.orders.list(query, user);
  }

  @Get('orders/companies')
  @RequirePermission('orders.read')
  companies() {
    return this.orders.companies();
  }

  @Get('orders/employees')
  @RequirePermission('orders.write')
  employees(
    @Query(new ZodValidationPipe(OrderEmployeeQuerySchema))
    query: z.infer<typeof OrderEmployeeQuerySchema>,
  ) {
    return this.orders.employees(query.q, query.page, query.pageSize);
  }

  @Get('orders/context')
  @RequirePermission('orders.write')
  context(
    @Query(new ZodValidationPipe(OrderContextQuerySchema))
    query: z.infer<typeof OrderContextQuerySchema>,
  ) {
    return this.orders.context(
      query.employeeId,
      query.deliveryDate,
      query.codes?.split(',').filter(Boolean),
    );
  }

  @Post('orders/close')
  @RequirePermission('cutoff.run')
  close(
    @Body(new ZodValidationPipe(CloseOrdersSchema)) body: z.infer<typeof CloseOrdersSchema>,
    @CurrentUser() user: SessionUser,
  ) {
    return this.orders.close(body.deliveryDate, user);
  }

  @Post('orders')
  @RequirePermission('orders.write')
  create(
    @Body(new ZodValidationPipe(OrderInputSchema)) body: OrderInput,
    @CurrentUser() user: SessionUser,
  ) {
    return this.orders.create(body, user);
  }

  @Get('orders/:id')
  @RequirePermission('orders.read')
  get(@Param('id', ParseIdPipe) id: string, @CurrentUser() user: SessionUser) {
    return this.orders.get(id, user);
  }

  @Put('orders/:id')
  @RequirePermission('orders.write')
  update(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(OrderInputSchema)) body: OrderInput,
    @CurrentUser() user: SessionUser,
  ) {
    return this.orders.update(id, body, user);
  }

  @Get('orders/:id/edit-context')
  @RequirePermission('orders.write')
  editContext(@Param('id', ParseIdPipe) id: string) {
    return this.orders.editContext(id);
  }

  @Post('orders/:id/place')
  @RequirePermission('orders.write')
  place(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(OrderActionSchema)) body: z.infer<typeof OrderActionSchema>,
    @CurrentUser() user: SessionUser,
  ) {
    return this.orders.action(id, 'place', body, user);
  }

  @Post('orders/:id/cancel')
  @RequirePermission('orders.write')
  cancel(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(OrderActionSchema)) body: z.infer<typeof OrderActionSchema>,
    @CurrentUser() user: SessionUser,
  ) {
    return this.orders.action(id, 'cancel', body, user);
  }

  @Post('orders/:id/reject')
  @RequirePermission('orders.override')
  reject(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(OrderActionSchema)) body: z.infer<typeof OrderActionSchema>,
    @CurrentUser() user: SessionUser,
  ) {
    return this.orders.action(id, 'reject', body, user);
  }

  @Get('orders/:id/override-choices')
  @RequirePermission('orders.override')
  choices(@Param('id', ParseIdPipe) id: string) {
    return this.orders.overrideChoices(id);
  }

  @Put('orders/:id/override')
  @RequirePermission('orders.override')
  override(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(OrderOverrideSchema)) body: z.infer<typeof OrderOverrideSchema>,
    @CurrentUser() user: SessionUser,
  ) {
    return this.orders.override(id, body, user);
  }

  /** Vercel cron wiring is added at deployment; absent secret fails closed. */
  @Get('internal/cutoff')
  @Public()
  cutoff(@Headers('authorization') authorization?: string) {
    const secret = process.env.CRON_SECRET;
    const supplied = Buffer.from(authorization ?? '');
    const expected = Buffer.from(`Bearer ${secret ?? ''}`);
    if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED',
        'Invalid cron credentials',
      );
    return this.orders.processDue();
  }
}
