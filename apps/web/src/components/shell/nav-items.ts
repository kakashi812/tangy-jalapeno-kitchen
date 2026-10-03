import { LayoutDashboard, type LucideIcon } from 'lucide-react';

export type NavItem = { href: string; label: string; icon: LucideIcon };

/**
 * Sidebar entries. Each module adds its own as it is built; from M1 the list is filtered by the
 * signed-in user's permissions (the server still enforces access on every request).
 */
export const NAV_ITEMS: NavItem[] = [{ href: '/', label: 'Dashboard', icon: LayoutDashboard }];
