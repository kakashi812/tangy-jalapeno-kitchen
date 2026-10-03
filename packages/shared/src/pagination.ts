import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;

/** Query params for every paginated list. Values arrive as strings from the URL, hence coerce. */
export const PageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
});
export type PageQuery = z.infer<typeof PageQuerySchema>;

/** Response shape of every paginated list. */
export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
  });
}

/** Rows to skip for a page (what the database needs). */
export function pageOffset({ page, pageSize }: PageQuery): number {
  return (page - 1) * pageSize;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
