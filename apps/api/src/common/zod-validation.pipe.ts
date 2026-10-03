import { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { toFieldErrors } from '@fernleaf/shared';
import { ApiException } from './api-exception.js';

/**
 * Validates a request body, query or param against a Zod schema from @fernleaf/shared and returns
 * the parsed (typed, defaulted, coerced) value. On failure it throws VALIDATION_FAILED with
 * per-field messages the form can show next to each input.
 *
 *   @Post() create(@Body(new ZodValidationPipe(CreateDishSchema)) body: CreateDish) { … }
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw ApiException.validation(toFieldErrors(result.error));
    }
    return result.data;
  }
}
