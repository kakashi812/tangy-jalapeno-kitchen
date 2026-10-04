import { ALL_PERMISSIONS, type Permission } from '@fernleaf/shared';

export type RoleDefinition = {
  name: string;
  description: string;
  isSystem: boolean;
  permissions: Permission[];
};

/**
 * The four brief roles plus a least-privilege order-taking role. Admins can create further roles
 * in the UI; authorization checks permissions, never these role names.
 */
export const ORDER_DESK_ROLE: RoleDefinition = {
  name: 'Order Desk',
  description:
    'Creates orders on behalf of employees; no locked-order overrides or operational administration.',
  isSystem: false,
  permissions: ['orders.read', 'orders.readMoney', 'orders.write'],
};

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
  ORDER_DESK_ROLE,
];
