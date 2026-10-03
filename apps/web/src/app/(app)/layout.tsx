import { AppShell } from '@/components/shell/app-shell';
import { getSessionUser } from '@/lib/session';

// Rendered per request: the shell shows the signed-in user and the kitchen's "today".
export const dynamic = 'force-dynamic';

/**
 * Layout for all signed-in pages. "(app)" is a route group: it groups pages under this layout
 * without adding "/app" to their URLs. The login page lives outside it.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return <AppShell user={user}>{children}</AppShell>;
}
