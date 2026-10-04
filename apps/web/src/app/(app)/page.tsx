import Link from 'next/link';
import { Suspense } from 'react';
import {
  DROP_LABELS,
  formatCents,
  formatKitchenDate,
  formatKitchenDateTime,
  type Dashboard,
} from '@fernleaf/shared';
import { PageHeader } from '@/components/page-header';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { NAV_ITEMS } from '@/components/shell/nav-items';
import { RefreshDashboard } from './refresh-dashboard';
function Metric({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: string | number;
  href?: string;
  hint?: string;
}) {
  const content = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="rounded-lg border bg-card p-5 transition-colors hover:bg-muted/40">
      {content}
    </Link>
  ) : (
    <div className="rounded-lg border bg-card p-5">{content}</div>
  );
}
async function Summary() {
  const dashboard = await apiGet<Dashboard>('/dashboard');
  const user = await getSessionUser();
  const date = dashboard.date;
  const orderLink = (status?: string) =>
    `/orders?from=${date}&to=${date}${status ? `&status=${status}` : ''}`;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{formatKitchenDate(date)} · Kitchen time (IST)</p>
        <p className="text-xs text-muted-foreground">
          Updated {formatKitchenDateTime(new Date(dashboard.asOf))}
        </p>
      </div>
      {dashboard.kind === 'ADMIN' && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Orders today"
              value={Object.values(dashboard.orders).reduce((n, v) => n + v, 0)}
              href={can(user, 'orders.read') ? orderLink() : undefined}
              hint="All statuses; grouped by delivery date"
            />
            <Metric
              label="Unpaid invoice total"
              value={formatCents(dashboard.unpaidCents)}
              href="/billing?status=UNPAID"
              hint={`${dashboard.unpaidInvoices} invoices · all dates`}
            />
            <Metric
              label="Invoices needing review"
              value={dashboard.reviewInvoices}
              href="/billing?review=true"
              hint="Paid and unpaid; all dates"
            />
            <Metric
              label="Delivered orders today"
              value={dashboard.orders.DELIVERED}
              href={can(user, 'orders.read') ? orderLink('DELIVERED') : undefined}
            />
          </section>
          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold">Today&apos;s order statuses</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {Object.entries(dashboard.orders).map(([status, count]) => (
                <Metric
                  key={status}
                  label={status.charAt(0) + status.slice(1).toLowerCase()}
                  value={count}
                  href={can(user, 'orders.read') ? orderLink(status) : undefined}
                />
              ))}
            </div>
          </section>
        </>
      )}
      {dashboard.kind === 'KITCHEN' && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Remaining prep units"
              value={dashboard.stations.reduce((n, s) => n + s.total - s.done, 0)}
              href={`/kitchen?deliveryDate=${date}`}
              hint="Started and unstarted unfinished units"
            />
            <Metric
              label="Late prep units"
              value={dashboard.stations.reduce((n, s) => n + s.late, 0)}
              href={`/kitchen?deliveryDate=${date}`}
              hint="Unfinished and past planned readiness"
            />
            <Metric
              label="At-risk prep units"
              value={dashboard.stations.reduce((n, s) => n + s.atRisk, 0)}
              href={`/kitchen?deliveryDate=${date}`}
              hint={`Unstarted, due within ${dashboard.atRiskMinutes} minutes`}
            />
            <Metric
              label="Kitchen-ready orders"
              value={dashboard.readyOrders}
              href={can(user, 'orders.read') ? orderLink('CONFIRMED') : undefined}
              hint="Confirmed today; every prep unit complete"
            />
          </section>
          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold">Kitchen stations</h2>
            <p className="text-sm text-muted-foreground">
              Open a station to work its queue. Counts cover all today&apos;s confirmed orders, not
              just the visible board page.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dashboard.stations.map((s) => (
                <Link
                  key={s.id ?? 'unassigned'}
                  href={`/kitchen?deliveryDate=${date}&stationId=${s.id ?? 'unassigned'}`}
                  className="space-y-3 rounded-lg border p-5 hover:bg-muted/30"
                >
                  <h3 className="font-medium">{s.name}</h3>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Remaining</dt>
                      <dd className="text-2xl font-semibold">{s.total - s.done}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Late</dt>
                      <dd className="text-2xl font-semibold text-red-700">{s.late}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">At risk</dt>
                      <dd className="text-2xl font-semibold text-amber-700">{s.atRisk}</dd>
                    </div>
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    {s.started} in progress · {s.done} done · {s.total} total
                  </p>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
      {dashboard.kind === 'DISPATCH' && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(dashboard.drops).map(([state, count]) => (
              <Metric
                key={state}
                label={DROP_LABELS[state as keyof typeof DROP_LABELS]}
                value={count}
                href={`/dispatch?deliveryDate=${date}&state=${state}`}
                hint="Drops, not individual orders"
              />
            ))}
            <Metric
              label="Drops without a driver"
              value={dashboard.unassigned}
              href={`/dispatch?deliveryDate=${date}`}
              hint="Waiting/kitchen-ready/dispatch-ready only"
            />
          </section>
          <p className="text-sm text-muted-foreground">
            Open a drop to inspect its individual orders, packaging and delivery instructions.
          </p>
        </>
      )}
      {dashboard.kind === 'DRIVER' && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Metric
              label="Your remaining drops"
              value={dashboard.remaining}
              href="/deliveries"
              hint="All assigned, not yet delivered, today only"
            />
            <Metric label="Out for delivery" value={dashboard.out} href="/deliveries" />
            <Metric label="Delivered today" value={dashboard.delivered} href="/deliveries" />
            <Metric
              label="Delivered on time"
              value={dashboard.onTime}
              hint="At or before the planned delivery time"
            />
            <Metric label="Delivered late" value={dashboard.late} />
            <Metric
              label="Timing not recorded"
              value={dashboard.unknownOnTime}
              hint="Shown separately, never counted as on time"
            />
          </section>
          <Link
            href="/deliveries"
            className="inline-block font-medium text-primary hover:underline"
          >
            Open my deliveries →
          </Link>
        </>
      )}
      {dashboard.kind === 'GENERAL' && (
        <p className="rounded-lg border p-5 text-sm text-muted-foreground">
          Your permissions do not include an operational dashboard. Use the available workspaces
          below.
        </p>
      )}
      <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">Your workspaces</h2>
        <div className="flex flex-wrap gap-3">
          {NAV_ITEMS.filter(
            (n) => n.href !== '/' && (!n.permission || can(user, n.permission)),
          ).map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted/30"
            >
              {n.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
export default async function DashboardPage() {
  const user = await getSessionUser();
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${user.name.split(' ')[0]}`}
        description="The operational picture for your role, with direct links to today's work."
      />
      <RefreshDashboard />
      <Suspense
        fallback={
          <div
            className="h-72 animate-pulse rounded-lg bg-muted"
            aria-busy
            aria-label="Loading dashboard"
          />
        }
      >
        <Summary />
      </Suspense>
    </div>
  );
}
