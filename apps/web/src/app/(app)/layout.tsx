import { AppShell } from '@/components/shell/app-shell';

// Rendered per request: the shell shows the kitchen's "today", which must not be frozen at build time.
export const dynamic = 'force-dynamic';

/**
 * Layout for all signed-in pages. "(app)" is a route group: it groups pages under this layout
 * without adding "/app" to their URLs. The login page (M1) will live outside it.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
