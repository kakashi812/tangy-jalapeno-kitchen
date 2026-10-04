import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS } from './permissions.js';
import { dashboardKind } from './dashboard.js';
describe('permission-based dashboard routing', () => {
  it('admin gets a single admin summary rather than every operational view', () =>
    expect(dashboardKind(ALL_PERMISSIONS)).toBe('ADMIN'));
  it('routes kitchen, dispatch and driver without role-name checks', () => {
    expect(dashboardKind(['kitchen.view', 'orders.read'])).toBe('KITCHEN');
    expect(dashboardKind(['dispatch.view', 'orders.read'])).toBe('DISPATCH');
    expect(dashboardKind(['deliveries.own'])).toBe('DRIVER');
  });
  it('does not grant a finance summary from only one financial permission', () => {
    expect(dashboardKind(['billing.read'])).toBe('GENERAL');
    expect(dashboardKind(['orders.readMoney'])).toBe('GENERAL');
  });
});
