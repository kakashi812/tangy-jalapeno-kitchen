import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  BillingQuerySchema,
  InvoiceCreateSchema,
  InvoicePaySchema,
  PageQuerySchema,
  ShortDeliverySchema,
  type BillingQuery,
  type InvoiceCreate,
  type SessionUser,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { CurrentUser, RequirePermission } from '../auth/decorators.js';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { BillingService } from './billing.service.js';
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}
  @Get('companies')
  @RequirePermission('billing.read')
  companies() {
    return this.billing.companies();
  }
  @Get('uninvoiced')
  @RequirePermission('billing.read')
  uninvoiced(@Query(new ZodValidationPipe(BillingQuerySchema)) query: BillingQuery) {
    return this.billing.uninvoiced(query);
  }
  @Get('invoices')
  @RequirePermission('billing.read')
  list(@Query(new ZodValidationPipe(BillingQuerySchema)) query: BillingQuery) {
    return this.billing.list(query);
  }
  @Get('invoices/:id')
  @RequirePermission('billing.read')
  get(
    @Param('id', ParseIdPipe) id: string,
    @Query(new ZodValidationPipe(PageQuerySchema)) query: z.infer<typeof PageQuerySchema>,
  ) {
    return this.billing.get(id, query);
  }
  @Post('invoices')
  @RequirePermission('billing.manage')
  create(
    @Body(new ZodValidationPipe(InvoiceCreateSchema)) input: InvoiceCreate,
    @CurrentUser() user: SessionUser,
  ) {
    return this.billing.create(input, user);
  }
  @Post('invoices/:id/pay')
  @RequirePermission('billing.manage')
  pay(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(InvoicePaySchema)) input: z.infer<typeof InvoicePaySchema>,
    @CurrentUser() user: SessionUser,
  ) {
    return this.billing.pay(id, input.version, user);
  }
  @Post('orders/:id/short')
  @RequirePermission('billing.manage')
  short(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(ShortDeliverySchema)) input: z.infer<typeof ShortDeliverySchema>,
    @CurrentUser() user: SessionUser,
  ) {
    return this.billing.reportShort(id, input, user);
  }
}
