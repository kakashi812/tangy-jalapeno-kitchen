import { ALL_PERMISSIONS, type Permission } from '@fernleaf/shared';

export type RoleDefinition = {
  name: string;
  description: string;
  isSystem: boolean;
  permissions: Permission[];
};

/**
 * The four roles from the brief (section 3). Each gets only what that job needs; admins can create
 * further roles in the UI.
 */
export const DEFAULT_ROLES: RoleDefinition[] = [
  {
    name: 'Admin',
    description: 'Everything: catalogue, pricing, companies, orders, staff, overrides.',
    isSystem: true,
    permissions: ALL_PERMISSIONS,
  },
  {
    name: 'Kitchen',
    description: 'Cooks: works the kitchen board; reads orders (without money) and the catalogue.',
    isSystem: false,
    permissions: ['kitchen.view', 'kitchen.work', 'orders.read', 'catalogue.read'],
  },
  {
    name: 'Dispatch',
    description: 'Gets cooked orders out of the door: drops, drivers, delivery tracking.',
    isSystem: false,
    permissions: [
      'dispatch.view',
      'drops.assign',
      'drops.advance',
      'orders.read',
      'companies.read',
    ],
  },
  {
    name: 'Driver',
    description: "Sees only today's own deliveries and marks them delivered.",
    isSystem: false,
    permissions: ['deliveries.own'],
  },
];
