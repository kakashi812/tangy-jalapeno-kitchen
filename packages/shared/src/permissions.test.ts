import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, PermissionSchema, isPermission } from './permissions.js';

describe('permissions', () => {
  it('lists every permission once', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    expect(ALL_PERMISSIONS).toContain('orders.override');
  });

  it('accepts known names and rejects unknown ones', () => {
    expect(isPermission('drops.assign')).toBe(true);
    expect(isPermission('orders.delete')).toBe(false);
    expect(isPermission('toString')).toBe(false); // not fooled by object prototype keys
    expect(PermissionSchema.safeParse('orders.delete').success).toBe(false);
  });
});
