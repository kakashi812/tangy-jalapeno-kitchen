import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, isPermission } from '@fernleaf/shared';
import { DEFAULT_ROLES, ORDER_DESK_ROLE } from './roles.js';

describe('default roles', () => {
  it('only use permissions that exist', () => {
    for (const role of DEFAULT_ROLES) {
      expect(role.permissions.every(isPermission)).toBe(true);
    }
  });

  it('give Admin everything and keep it a locked system role', () => {
    const admin = DEFAULT_ROLES.find((role) => role.name === 'Admin');
    expect(admin?.isSystem).toBe(true);
    expect(admin?.permissions).toEqual(ALL_PERMISSIONS);
  });

  it('keep money and overrides away from kitchen, dispatch and drivers', () => {
    for (const role of DEFAULT_ROLES.filter((r) =>
      ['Kitchen', 'Dispatch', 'Driver'].includes(r.name),
    )) {
      expect(role.permissions).not.toContain('orders.readMoney');
      expect(role.permissions).not.toContain('orders.override');
    }
  });

  it('gives Order Desk only the permissions needed to take orders with visible prices', () => {
    expect(ORDER_DESK_ROLE.isSystem).toBe(false);
    expect(ORDER_DESK_ROLE.permissions).toEqual([
      'orders.read',
      'orders.readMoney',
      'orders.write',
    ]);
    expect(DEFAULT_ROLES).toContain(ORDER_DESK_ROLE);
  });

  it('does not give the four brief roles additional order-taking privileges', () => {
    for (const name of ['Kitchen', 'Dispatch', 'Driver']) {
      expect(DEFAULT_ROLES.find((role) => role.name === name)?.permissions).not.toContain(
        'orders.write',
      );
    }
  });
});
