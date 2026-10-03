import { z } from 'zod';

/**
 * Every action the server can authorise. Endpoints declare the permission they need; roles (stored
 * in the database) are just named sets of these. No code checks a role name, so a new role is a new
 * row, not a code change.
 *
 * The list lives in code because code is what checks it. The web app uses the same names to decide
 * what to show, but the server always enforces.
 */
export const PERMISSIONS = {
  'staff.read': { group: 'Staff', label: 'View staff accounts' },
  'staff.manage': { group: 'Staff', label: 'Create, edit and deactivate staff; reset passwords' },
  'roles.manage': { group: 'Staff', label: 'Create and edit roles' },

  'settings.manage': { group: 'Settings', label: 'Edit kitchen calendar, cut-off and settings' },

  'catalogue.read': { group: 'Catalogue', label: 'View dishes, options and reference data' },
  'catalogue.manage': { group: 'Catalogue', label: 'Edit dishes, options and reference data' },
  'pricing.read': { group: 'Pricing', label: 'View price tiers and prices' },
  'pricing.manage': { group: 'Pricing', label: 'Edit price tiers and prices' },
  'menu.read': { group: 'Menu', label: 'View menu categories and preview menus' },
  'menu.manage': { group: 'Menu', label: 'Edit menu categories and hiding' },

  'companies.read': { group: 'Companies', label: 'View companies' },
  'companies.manage': { group: 'Companies', label: 'Edit companies' },
  'employees.read': { group: 'Companies', label: 'View employees' },
  'employees.manage': { group: 'Companies', label: 'Edit and import employees' },

  'orders.read': { group: 'Orders', label: 'View orders (without money)' },
  'orders.readMoney': { group: 'Orders', label: 'See prices and totals on orders' },
  'orders.write': { group: 'Orders', label: 'Create, edit and cancel orders before cut-off' },
  'orders.override': {
    group: 'Orders',
    label: 'Override orders after cut-off (delivery time, address, packaging, edits)',
  },
  'cutoff.run': { group: 'Orders', label: 'Run cut-off processing manually' },

  'kitchen.view': { group: 'Kitchen', label: 'View the kitchen board' },
  'kitchen.work': { group: 'Kitchen', label: 'Mark prep units started and done' },
  'kitchen.forceComplete': { group: 'Kitchen', label: 'Force-complete a whole order' },

  'dispatch.view': { group: 'Dispatch', label: 'View the dispatch board' },
  'drops.assign': { group: 'Dispatch', label: 'Assign drivers to drops' },
  'drops.advance': { group: 'Dispatch', label: 'Move drops through dispatch steps' },
  'deliveries.own': { group: 'Dispatch', label: "See and complete one's own deliveries (driver)" },

  'billing.read': { group: 'Billing', label: 'View uninvoiced orders and invoices' },
  'billing.manage': { group: 'Billing', label: 'Create invoices and mark them paid' },
} as const satisfies Record<string, { group: string; label: string }>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const PermissionSchema = z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]]);

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}
