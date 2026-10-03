import { KITCHEN_TIME_ZONE, formatKitchenDate, kitchenToday } from '@fernleaf/shared';
import { NavLinks } from './nav-links';

function Brand() {
  return (
    <div className="font-heading text-xl font-bold tracking-tight text-sidebar-foreground">
      Fernleaf Kitchen
    </div>
  );
}

/**
 * The frame around every signed-in page: sidebar on wide screens, a top bar with horizontal
 * navigation on phones (drivers use the panel on a phone). The date shown is the kitchen's today,
 * worked out on the server, so it is the same for every viewer wherever they are.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const today = formatKitchenDate(kitchenToday());

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 md:flex">
        <Brand />
        <NavLinks orientation="vertical" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-col gap-2 border-b bg-sidebar px-4 py-3 md:bg-background">
          <div className="flex items-center justify-between gap-4">
            <div className="md:hidden">
              <Brand />
            </div>
            <p className="ml-auto text-sm text-muted-foreground">
              Kitchen today: <span className="font-medium text-foreground">{today}</span>{' '}
              <span title={KITCHEN_TIME_ZONE}>(IST)</span>
            </p>
          </div>
          <div className="md:hidden">
            <NavLinks orientation="horizontal" />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
