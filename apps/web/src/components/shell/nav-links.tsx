'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Permission } from '@fernleaf/shared';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav-items';

/**
 * Client component only because highlighting the current page needs the URL (usePathname).
 * It receives the user's permissions (plain strings) rather than the items, because icon
 * components can't be passed from the server to the browser.
 */
export function NavLinks({
  orientation,
  permissions,
}: {
  orientation: 'vertical' | 'horizontal';
  permissions: Permission[];
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter(
    (item) => !item.permission || permissions.includes(item.permission),
  );

  return (
    <nav className={cn('flex gap-1', orientation === 'vertical' ? 'flex-col' : 'overflow-x-auto')}>
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
