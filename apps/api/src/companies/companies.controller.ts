import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  AddressInputSchema,
  CompanyHolidayInputSchema,
  CompanyInputSchema,
  CompanyListQuerySchema,
  type CompanyDetail,
  type CompanyHolidayInput,
  type CompanyListQuery,
  type CompanySummary,
  type DriverOption,
  type Paginated,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CompaniesService } from './companies.service.js';

/** Companies: readable with companies.read (admin, dispatch); changed with companies.manage. */
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @RequirePermission('companies.read')
  @Get()
  list(
    @Query(new ZodValidationPipe(CompanyListQuerySchema)) query: CompanyListQuery,
  ): Promise<Paginated<CompanySummary>> {
    return this.companies.list(query);
  }

  /** Drivers that can be a company's default driver (also used by dispatch). */
  @RequirePermission('companies.read')
  @Get('drivers')
  drivers(): Promise<DriverOption[]> {
    return this.companies.drivers();
  }

  @RequirePermission('companies.read')
  @Get(':id')
  get(@Param('id', ParseIdPipe) id: string): Promise<CompanyDetail> {
    return this.companies.get(id);
  }

  @RequirePermission('companies.manage')
  @Post()
  create(
    @Body(new ZodValidationPipe(CompanyInputSchema)) body: z.output<typeof CompanyInputSchema>,
  ): Promise<CompanyDetail> {
    return this.companies.create(body);
  }

  @RequirePermission('companies.manage')
  @Put(':id')
  update(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(CompanyInputSchema)) body: z.output<typeof CompanyInputSchema>,
  ): Promise<CompanyDetail> {
    return this.companies.update(id, body);
  }

  @RequirePermission('companies.manage')
  @Post(':id/addresses')
  addAddress(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(AddressInputSchema)) body: z.output<typeof AddressInputSchema>,
  ): Promise<CompanyDetail> {
    return this.companies.addAddress(id, body);
  }

  @RequirePermission('companies.manage')
  @Put(':id/addresses/:addressId')
  updateAddress(
    @Param('id', ParseIdPipe) id: string,
    @Param('addressId', ParseIdPipe) addressId: string,
    @Body(new ZodValidationPipe(AddressInputSchema)) body: z.output<typeof AddressInputSchema>,
  ): Promise<CompanyDetail> {
    return this.companies.updateAddress(id, addressId, body);
  }

  @RequirePermission('companies.manage')
  @Delete(':id/addresses/:addressId')
  deleteAddress(
    @Param('id', ParseIdPipe) id: string,
    @Param('addressId', ParseIdPipe) addressId: string,
  ): Promise<CompanyDetail> {
    return this.companies.deleteAddress(id, addressId);
  }

  @RequirePermission('companies.manage')
  @Post(':id/holidays')
  addHoliday(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(CompanyHolidayInputSchema)) body: CompanyHolidayInput,
  ): Promise<CompanyDetail> {
    return this.companies.addHoliday(id, body);
  }

  @RequirePermission('companies.manage')
  @Delete(':id/holidays/:holidayId')
  deleteHoliday(
    @Param('id', ParseIdPipe) id: string,
    @Param('holidayId', ParseIdPipe) holidayId: string,
  ): Promise<CompanyDetail> {
    return this.companies.deleteHoliday(id, holidayId);
  }
}
