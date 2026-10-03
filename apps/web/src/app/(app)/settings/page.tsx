import type { Metadata } from 'next';
import { Suspense } from 'react';
import {
  formatKitchenDate,
  formatKitchenDateTime,
  kitchenToday,
  type CutoffPreviewDay,
  type KitchenHoliday,
  type Settings,
} from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { KitchenHolidays } from './holidays';
import { SettingsForm } from './settings-form';

export const metadata: Metadata = { title: 'Settings' };

/** What the current rules mean in practice: when each upcoming delivery date locks. */
async function CutoffPreview() {
  const days = await apiGet<CutoffPreviewDay[]>('/settings/cutoffs?days=14');
  return (
    <div className="max-w-2xl overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left">
          <tr>
            <th className="px-4 py-2 font-medium">Delivery date</th>
            <th className="px-4 py-2 font-medium">Orders lock at (IST)</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {days.map((day) => (
            <tr key={day.deliveryDate} className={day.kitchenOpen ? '' : 'text-muted-foreground'}>
              <td className="px-4 py-2">{formatKitchenDate(day.deliveryDate)}</td>
              <td className="px-4 py-2">
                {day.cutoffAt
                  ? formatKitchenDateTime(new Date(day.cutoffAt))
                  : `Kitchen closed${day.holidayName ? ` (${day.holidayName})` : ''}: no deliveries`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!can(user, 'settings.manage')) return <NoAccess />;
  const [settings, holidays] = await Promise.all([
    apiGet<Settings>('/settings'),
    apiGet<KitchenHoliday[]>('/kitchen-holidays'),
  ]);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Settings"
        description="Kitchen calendar, order cut-off and kitchen timings. All times are kitchen time (IST)."
      />

      <section className="space-y-4">
        <h2 className="font-heading text-lg font-bold">Calendar, cut-off and timings</h2>
        <SettingsForm settings={settings} />
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-bold">Kitchen closures</h2>
          <p className="text-sm text-muted-foreground">
            No deliveries on these days, and they are skipped when counting back to a cut-off.
          </p>
        </div>
        <KitchenHolidays holidays={holidays} today={kitchenToday()} />
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-bold">Upcoming cut-offs</h2>
          <p className="text-sm text-muted-foreground">
            When orders for each of the next 14 days lock, under the settings above.
          </p>
        </div>
        <Suspense
          fallback={<div className="h-96 max-w-2xl animate-pulse rounded-lg bg-muted" aria-busy />}
        >
          <CutoffPreview />
        </Suspense>
      </section>
    </div>
  );
}
