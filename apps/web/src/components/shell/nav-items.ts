import {
  Building2,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Tags,
  Settings,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@fernleaf/shared';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown only to staff with this permission. The API enforces the same rule on every request. */
  permission?: Permission;
};

/** Sidebar entries. Each module adds its own as it is built. */
export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/catalogue', label: 'Catalogue', icon: UtensilsCrossed, permission: 'catalogue.read' },
  { href: '/companies', label: 'Companies', icon: Building2, permission: 'companies.read' },
  { href: '/pricing', label: 'Pricing', icon: Tags, permission: 'pricing.read' },
  { href: '/staff', label: 'Staff', icon: Users, permission: 'staff.read' },
  { href: '/roles', label: 'Roles', icon: KeyRound, permission: 'roles.manage' },
  { href: '/reference', label: 'Reference lists', icon: ListChecks, permission: 'settings.manage' },
  { href: '/settings', label: 'Settings', icon: Settings, permission: 'settings.manage' },
];
