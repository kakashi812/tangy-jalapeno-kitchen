import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  PipeTransform,
  Post,
  Query,
} from '@nestjs/common';
import {
  ReferenceItemInputSchema,
  ReferenceItemUpdateSchema,
  ReferenceKindSchema,
  type ReferenceItem,
  type ReferenceItemUpdate,
  type ReferenceKind,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { RequirePermission, SignedIn } from '../auth/decorators.js';
import { ApiException } from '../common/api-exception.js';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ReferenceService } from './reference.service.js';

/** An unknown list name in the URL is a page that doesn't exist: 404. */
class ParseKindPipe implements PipeTransform<string, ReferenceKind> {
  transform(value: string): ReferenceKind {
    const parsed = ReferenceKindSchema.safeParse(value);
    if (!parsed.success) throw ApiException.notFound('List');
    return parsed.data;
  }
}

/**
 * /reference/allergens, /reference/dietary-tags, /reference/stations, /reference/portion-sizes,
 * /reference/packaging-types. Any signed-in staff can read them (cooks need stations and
 * allergens); only admins change them.
 */
@Controller('reference/:kind')
export class ReferenceController {
  constructor(private readonly reference: ReferenceService) {}

  @SignedIn()
  @Get()
  list(
    @Param('kind', ParseKindPipe) kind: ReferenceKind,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<ReferenceItem[]> {
    return this.reference.list(kind, includeInactive === 'true');
  }

  @RequirePermission('settings.manage')
  @Post()
  create(
    @Param('kind', ParseKindPipe) kind: ReferenceKind,
    @Body(new ZodValidationPipe(ReferenceItemInputSchema))
    body: z.output<typeof ReferenceItemInputSchema>,
  ): Promise<ReferenceItem> {
    return this.reference.create(kind, body);
  }

  @RequirePermission('settings.manage')
  @Patch(':id')
  update(
    @Param('kind', ParseKindPipe) kind: ReferenceKind,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(ReferenceItemUpdateSchema)) body: ReferenceItemUpdate,
  ): Promise<ReferenceItem> {
    return this.reference.update(kind, id, body);
  }

  @RequirePermission('settings.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('kind', ParseKindPipe) kind: ReferenceKind,
    @Param('id', ParseIdPipe) id: string,
  ): Promise<void> {
    return this.reference.remove(kind, id);
  }
}
