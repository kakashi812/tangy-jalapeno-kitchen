import Link from 'next/link';
import { pageCount } from '@fernleaf/shared';
import { cn } from '@/lib/utils';

/**
 * Previous / next links for a server-paginated list. The page lives in the URL (?page=2), so it
 * survives refresh, the back button works, and the link can be shared. Other query params
 * (search, filters) are kept.
 */
export function Pagination({
  pathname,
  params,
  page,
  pageSize,
  total,
}: {
  pathname: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = pageCount(total, pageSize);
  const href = (target: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== 'page') query.set(key, value);
    }
    if (target > 1) query.set('page', String(target));
    const qs = query.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const linkClass = 'rounded-md border px-3 py-1.5 text-sm hover:bg-muted';
  const disabledClass = 'pointer-events-none opacity-40';

  return (
    <nav className="flex items-center justify-between gap-4 text-sm" aria-label="Pagination">
      <p className="text-muted-foreground">
        {total === 0 ? 'No results' : `${first}–${last} of ${total}`}
      </p>
      <div className="flex gap-2">
        <Link
          href={href(page - 1)}
          aria-disabled={page <= 1}
          className={cn(linkClass, page <= 1 && disabledClass)}
        >
          Previous
        </Link>
        <Link
          href={href(page + 1)}
          aria-disabled={page >= pages}
          className={cn(linkClass, page >= pages && disabledClass)}
        >
          Next
        </Link>
      </div>
    </nav>
  );
}
