import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, isPermission } from '@fernleaf/shared';
import { DEFAULT_ROLES } from './roles.js';

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
    for (const role of DEFAULT_ROLES.filter((r) => !r.isSystem)) {
      expect(role.permissions).not.toContain('orders.readMoney');
      expect(role.permissions).not.toContain('orders.override');
    }
  });
});
