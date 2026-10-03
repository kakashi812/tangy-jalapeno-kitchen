import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toFieldErrors } from './errors.js';
import { PageQuerySchema, pageCount, pageOffset } from './pagination.js';

describe('toFieldErrors', () => {
  it('keys messages by dotted field path', () => {
    const schema = z.object({ lines: z.array(z.object({ quantity: z.number().min(1) })) });
    const result = schema.safeParse({ lines: [{ quantity: 0 }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(toFieldErrors(result.error))).toEqual(['lines.0.quantity']);
    }
  });
});

describe('pagination', () => {
  it('coerces URL strings and applies defaults', () => {
    expect(PageQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(PageQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({ page: 3, pageSize: 50 });
  });

  it('rejects out-of-range values', () => {
    expect(PageQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(PageQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
  });

  it('computes offsets and page counts', () => {
    expect(pageOffset({ page: 3, pageSize: 20 })).toBe(40);
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(41, 20)).toBe(3);
  });
});
