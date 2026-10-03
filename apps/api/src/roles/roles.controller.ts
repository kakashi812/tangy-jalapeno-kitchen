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
} from '@nestjs/common';
import { RoleInputSchema, type RoleDetail } from '@fernleaf/shared';
import type { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RolesService } from './roles.service.js';

type RoleBody = z.output<typeof RoleInputSchema>;

/**
 * Roles are named sets of permissions. Reading them needs staff.read (the staff form lists roles);
 * changing them needs roles.manage. The built-in Admin role can't be changed.
 */
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @RequirePermission('staff.read')
  @Get()
  list(): Promise<RoleDetail[]> {
    return this.roles.list();
  }

  @RequirePermission('staff.read')
  @Get(':id')
  get(@Param('id', ParseIdPipe) id: string): Promise<RoleDetail> {
    return this.roles.get(id);
  }

  @RequirePermission('roles.manage')
  @Post()
  create(@Body(new ZodValidationPipe(RoleInputSchema)) body: RoleBody): Promise<RoleDetail> {
    return this.roles.create(body);
  }

  @RequirePermission('roles.manage')
  @Put(':id')
  update(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(RoleInputSchema)) body: RoleBody,
  ): Promise<RoleDetail> {
    return this.roles.update(id, body);
  }

  @RequirePermission('roles.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIdPipe) id: string): Promise<void> {
    return this.roles.remove(id);
  }
}
