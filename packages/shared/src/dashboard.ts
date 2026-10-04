import type { Permission } from './permissions.js';
import type { KitchenStationSummary } from './kitchen.js';
import type { DropState } from './drops.js';
import type { OrderStatus } from './orders.js';
export type DashboardKind = 'ADMIN' | 'KITCHEN' | 'DISPATCH' | 'DRIVER' | 'GENERAL';
/** Permission-based landing, not scattered checks of editable role names. */
export function dashboardKind(permissions: readonly Permission[]): DashboardKind {
  if (permissions.includes('billing.read') && permissions.includes('orders.readMoney'))
    return 'ADMIN';
  if (permissions.includes('kitchen.view')) return 'KITCHEN';
  if (permissions.includes('dispatch.view')) return 'DISPATCH';
  if (permissions.includes('deliveries.own')) return 'DRIVER';
  return 'GENERAL';
}
type Base = {
  date: string;
  asOf: string;
  calendar: { workingDay: boolean; nextWorkingDate: string | null };
};
export type Dashboard = Base &
  (
    | {
        kind: 'ADMIN';
        orders: Record<OrderStatus, number>;
        unpaidCents: number;
        unpaidInvoices: number;
        reviewInvoices: number;
      }
    | {
        kind: 'KITCHEN';
        stations: KitchenStationSummary[];
        readyOrders: number;
        atRiskMinutes: number;
      }
    | { kind: 'DISPATCH'; drops: Record<DropState, number>; unassigned: number }
    | {
        kind: 'DRIVER';
        remaining: number;
        delivered: number;
        out: number;
        onTime: number;
        late: number;
        unknownOnTime: number;
      }
    | { kind: 'GENERAL' }
  );
