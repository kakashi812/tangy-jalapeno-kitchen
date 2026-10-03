import { PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { ApiException } from './api-exception.js';

const IdSchema = z.uuid();

/**
 * Checks a route `:id` is a UUID before it reaches the database. A malformed id can't match any
 * record, so it is answered the same way as an id that doesn't exist: 404.
 *
 *   @Get(':id') get(@Param('id', ParseIdPipe) id: string) { … }
 */
export class ParseIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!IdSchema.safeParse(value).success) throw ApiException.notFound('Record');
    return value;
  }
}
