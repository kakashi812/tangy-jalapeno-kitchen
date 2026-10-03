import {
  Body,
  Controller,
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
  EmployeeInputSchema,
  EmployeeListQuerySchema,
  SetOwnerSchema,
  type EmployeeImportResult,
  type EmployeeListQuery,
  type EmployeeSummary,
  type Paginated,
  type SetOwnerInput,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { EmployeesService } from './employees.service.js';

/** CSV uploads are small text files; 1 MB is ~10 000 rows, well above the 1 000-row limit. */
const MAX_CSV_BYTES = 1024 * 1024;

@Controller()
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @RequirePermission('employees.read')
  @Get('employees')
  list(
    @Query(new ZodValidationPipe(EmployeeListQuerySchema)) query: EmployeeListQuery,
  ): Promise<Paginated<EmployeeSummary>> {
    return this.employees.list(query);
  }

  @RequirePermission('employees.read')
  @Get('employees/:id')
  get(@Param('id', ParseIdPipe) id: string): Promise<EmployeeSummary> {
    return this.employees.get(id);
  }

  @RequirePermission('employees.manage')
  @Post('employees')
  create(
    @Body(new ZodValidationPipe(EmployeeInputSchema)) body: z.output<typeof EmployeeInputSchema>,
  ): Promise<EmployeeSummary> {
    return this.employees.create(body);
  }

  @RequirePermission('employees.manage')
  @Put('employees/:id')
  update(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(EmployeeInputSchema)) body: z.output<typeof EmployeeInputSchema>,
  ): Promise<EmployeeSummary> {
    return this.employees.update(id, body);
  }

  @RequirePermission('companies.manage')
  @Put('companies/:id/owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  setOwner(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(SetOwnerSchema)) body: SetOwnerInput,
  ): Promise<void> {
    return this.employees.setOwner(id, body.employeeId);
  }

  /** multipart/form-data with a "file" field (CSV). */
  @RequirePermission('employees.manage')
  @Post('companies/:id/employees/import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_CSV_BYTES, files: 1 } }))
  import(
    @Param('id', ParseIdPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<EmployeeImportResult> {
    return this.employees.importCsv(id, file);
  }
}
