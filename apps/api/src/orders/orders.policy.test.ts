import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, ORDER_STATUSES, type SessionUser } from '@fernleaf/shared';
import { cutoffStatus, orderPermissions, requireAction, requireVersion } from './orders.policy.js';

const now = new Date('2026-10-05T10:30:00Z');
const writer: SessionUser = {
  id: 'writer',
  name: 'Writer',
  email: 'writer@test.com',
  role: { id: 'role', name: 'Custom role' },
  permissions: ['orders.write'],
};
const admin: SessionUser = { ...writer, permissions: ALL_PERMISSIONS };
const readOnly: SessionUser = { ...writer, permissions: ['orders.read'] };
const state = {
  status: 'DRAFT' as const,
  cutoffAt: new Date(now.getTime() + 1),
  kitchenStartedAt: null,
  outForDeliveryAt: null,
};

describe('order lifecycle permissions', () => {
  it('lets writers edit/place/cancel drafts before their saved cutoff', () => {
    expect(orderPermissions(state, writer, false, now)).toEqual({
      edit: true,
      place: true,
      cancel: true,
      reject: false,
      override: false,
    });
  });
  it('locks exactly at cutoff, not just after it', () => {
    expect(orderPermissions({ ...state, cutoffAt: now }, writer, false, now).edit).toBe(false);
  });
  it('an early closure also locks a future cutoff', () => {
    expect(orderPermissions(state, writer, true, now).place).toBe(false);
  });
  it('admin permission bypasses cutoff without role-name checks', () => {
    const user = {
      ...writer,
      role: { id: 'custom', name: 'Supervisor' },
      permissions: admin.permissions,
    };
    expect(orderPermissions(state, user, true, now).edit).toBe(true);
  });
  it('placed orders cannot be placed twice', () => {
    expect(orderPermissions({ ...state, status: 'PLACED' }, admin, false, now).place).toBe(false);
  });
  it('allows confirmed line edits only to authorized writers before kitchen starts', () => {
    const confirmed = { ...state, status: 'CONFIRMED' as const };
    expect(orderPermissions(confirmed, writer, false, now).edit).toBe(false);
    expect(orderPermissions(confirmed, admin, false, now).edit).toBe(true);
    expect(orderPermissions({ ...confirmed, kitchenStartedAt: now }, admin, false, now).edit).toBe(
      false,
    );
    expect(
      orderPermissions(confirmed, { ...writer, permissions: ['orders.override'] }, false, now).edit,
    ).toBe(false);
  });
  it('delivery overrides remain possible after kitchen starts, but stop at out for delivery', () => {
    const confirmed = { ...state, status: 'CONFIRMED' as const, kitchenStartedAt: now };
    expect(orderPermissions(confirmed, admin, false, now).override).toBe(true);
    expect(
      orderPermissions({ ...confirmed, outForDeliveryAt: now }, admin, false, now).override,
    ).toBe(false);
  });
  it('rejects placed/confirmed orders, not drafts or fulfilled orders', () => {
    for (const status of ORDER_STATUSES)
      expect(orderPermissions({ ...state, status }, admin, false, now).reject).toBe(
        ['PLACED', 'CONFIRMED'].includes(status),
      );
  });
  it('delivered, rejected and cancelled are terminal for order actions', () => {
    for (const status of ['DELIVERED', 'REJECTED', 'CANCELLED'] as const)
      expect(
        Object.values(orderPermissions({ ...state, status }, admin, false, now)),
      ).not.toContain(true);
  });
  it('read-only access never grants write actions', () => {
    for (const status of ORDER_STATUSES)
      expect(
        Object.values(orderPermissions({ ...state, status }, readOnly, false, now)),
      ).not.toContain(true);
  });
  it('refuses stale or missing versions', () => {
    expect(() => requireVersion(3, 3)).not.toThrow();
    expect(() => requireVersion(3, 2)).toThrow('changed');
    expect(() => requireVersion(3, undefined)).toThrow('changed');
    expect(() => requireAction(false)).toThrow('current state');
  });
  it('cutoff is an idempotent transition on every order status', () => {
    for (const status of ORDER_STATUSES)
      expect(cutoffStatus(cutoffStatus(status))).toBe(cutoffStatus(status));
    expect(cutoffStatus('DRAFT')).toBe('CANCELLED');
    expect(cutoffStatus('PLACED')).toBe('CONFIRMED');
  });
});
