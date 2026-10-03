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
  PriceGridQuerySchema,
  SetPricesSchema,
  TierInputSchema,
  type ItemTierPrice,
  type Paginated,
  type PriceGridQuery,
  type PriceGridRow,
  type SetPricesInput,
  type TierSummary,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PricingService } from './pricing.service.js';

type TierBody = z.output<typeof TierInputSchema>;

/** Price tiers and their prices. Reading needs pricing.read; changing needs pricing.manage. */
@Controller('price-tiers')
export class PriceTiersController {
  constructor(private readonly pricing: PricingService) {}

  @RequirePermission('pricing.read')
  @Get()
  list(): Promise<TierSummary[]> {
    return this.pricing.listTiers();
  }

  @RequirePermission('pricing.read')
  @Get(':id')
  get(@Param('id', ParseIdPipe) id: string): Promise<TierSummary> {
    return this.pricing.getTier(id);
  }

  @RequirePermission('pricing.manage')
  @Post()
  create(@Body(new ZodValidationPipe(TierInputSchema)) body: TierBody): Promise<TierSummary> {
    return this.pricing.createTier(body);
  }

  @RequirePermission('pricing.manage')
  @Put(':id')
  update(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(TierInputSchema)) body: TierBody,
  ): Promise<TierSummary> {
    return this.pricing.updateTier(id, body);
  }

  @RequirePermission('pricing.manage')
  @Post(':id/make-default')
  @HttpCode(HttpStatus.OK)
  makeDefault(@Param('id', ParseIdPipe) id: string): Promise<TierSummary> {
    return this.pricing.makeDefault(id);
  }

  @RequirePermission('pricing.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIdPipe) id: string): Promise<void> {
    return this.pricing.deleteTier(id);
  }

  /** ?kind=dishes|options&q=&missing=true&page= */
  @RequirePermission('pricing.read')
  @Get(':id/prices')
  grid(
    @Param('id', ParseIdPipe) id: string,
    @Query(new ZodValidationPipe(PriceGridQuerySchema)) query: PriceGridQuery,
  ): Promise<Paginated<PriceGridRow>> {
    return this.pricing.grid(id, query);
  }

  @RequirePermission('pricing.manage')
  @Put(':id/prices')
  @HttpCode(HttpStatus.NO_CONTENT)
  setPrices(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(SetPricesSchema)) body: SetPricesInput,
  ): Promise<void> {
    return this.pricing.setPrices(id, body);
  }
}

/** A dish's or option's price on every tier (the dish card's "Prices" button). */
@Controller()
export class ItemPricesController {
  constructor(private readonly pricing: PricingService) {}

  @RequirePermission('pricing.read')
  @Get('dishes/:id/prices')
  dishPrices(@Param('id', ParseIdPipe) id: string): Promise<ItemTierPrice[]> {
    return this.pricing.itemPrices('dishes', id);
  }

  @RequirePermission('pricing.read')
  @Get('options/:id/prices')
  optionPrices(@Param('id', ParseIdPipe) id: string): Promise<ItemTierPrice[]> {
    return this.pricing.itemPrices('options', id);
  }
}
