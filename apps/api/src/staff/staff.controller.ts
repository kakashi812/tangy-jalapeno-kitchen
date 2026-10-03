import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateStaffSchema,
  ResetPasswordSchema,
  StaffListQuerySchema,
  UpdateStaffSchema,
  type CreateStaffInput,
  type Paginated,
  type ResetPasswordInput,
  type SessionUser,
  type StaffListQuery,
  type StaffMember,
  type UpdateStaffInput,
} from '@fernleaf/shared';
import { CurrentUser, RequirePermission } from '../auth/decorators.js';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { StaffService } from './staff.service.js';

/** Staff accounts: the people who sign in to the panel. */
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @RequirePermission('staff.read')
  @Get()
  list(
    @Query(new ZodValidationPipe(StaffListQuerySchema)) query: StaffListQuery,
  ): Promise<Paginated<StaffMember>> {
    return this.staff.list(query);
  }

  @RequirePermission('staff.read')
  @Get(':id')
  get(@Param('id', ParseIdPipe) id: string): Promise<StaffMember> {
    return this.staff.get(id);
  }

  @RequirePermission('staff.manage')
  @Post()
  create(
    @Body(new ZodValidationPipe(CreateStaffSchema)) body: CreateStaffInput,
  ): Promise<StaffMember> {
    return this.staff.create(body);
  }

  @RequirePermission('staff.manage')
  @Patch(':id')
  update(
    @CurrentUser() actor: SessionUser,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(UpdateStaffSchema)) body: UpdateStaffInput,
  ): Promise<StaffMember> {
    return this.staff.update(actor.id, id, body);
  }

  @RequirePermission('staff.manage')
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(ResetPasswordSchema)) body: ResetPasswordInput,
  ): Promise<void> {
    return this.staff.resetPassword(id, body.password);
  }
}
