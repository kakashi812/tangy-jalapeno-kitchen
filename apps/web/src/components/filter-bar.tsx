import Link from 'next/link';
import { Search } from 'lucide-react';
import { selectClassName } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * One bar holding all of a list page's filters on a single line (wrapping only on narrow screens).
 * It's a plain GET form: the filters go into the URL, so they survive refresh, can be shared, and
 * work without JavaScript.
 */
export function FilterBar({
  action,
  active,
  children,
}: {
  action: string;
  /** Whether any filter is set, to offer "Clear". */
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2 lg:flex-nowrap"
      role="search"
    >
      {children}
      <div className="ml-auto flex shrink-0 gap-2">
        {active ? (
          <Link href={action} className="px-2 text-sm text-muted-foreground hover:text-foreground">
            Clear
          </Link>
        ) : null}
        <Button type="submit" size="sm">
          Apply
        </Button>
      </div>
    </form>
  );
}

/** The search box in a FilterBar: takes the remaining width. */
export function FilterSearch({ placeholder, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <div className="relative min-w-48 flex-1">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        aria-label={placeholder}
        placeholder={placeholder}
        className="bg-background pl-8"
        {...props}
      />
    </div>
  );
}

/** A dropdown in a FilterBar: only as wide as its content, never the full line. */
export function FilterSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(selectClassName, 'w-auto min-w-32 shrink-0 bg-background', className)}
      {...props}
    />
  );
}
