'use client';
import Link from 'next/link';
import { useEffect, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  formatKitchenDateTime,
  formatTimeOfDay,
  type KitchenBoard,
  type KitchenUnit,
} from '@fernleaf/shared';
import { FormError } from '@/components/form/field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiSend } from '@/lib/api/client';
import { cn } from '@/lib/utils';
type Action = { unitId: string; orderId: string; action: 'start' | 'done' | 'force'; at: string };
const LABEL = { ON_TRACK: 'On track', AT_RISK: 'At risk', LATE: 'Late', DONE: 'Done' };

export function Board({
  data,
  stationId,
  work,
  force,
  readOrders,
}: {
  data: KitchenBoard;
  stationId?: string;
  work: boolean;
  force: boolean;
  readOrders: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [units, optimistic] = useOptimistic(
    data.units.items,
    (current: KitchenUnit[], update: Action) =>
      current.map((u) => {
        if (update.action === 'force' ? u.orderId !== update.orderId : u.id !== update.unitId)
          return u;
        return {
          ...u,
          startedAt: u.startedAt ?? update.at,
          ...(update.action !== 'start' ? { doneAt: update.at, urgency: 'DONE' as const } : {}),
        };
      }),
  );
  useEffect(() => {
    const timer = setInterval(() => {
      if (!pending && document.visibilityState === 'visible')
        startTransition(() => router.refresh());
    }, 15_000);
    return () => clearInterval(timer);
  }, [pending, router]);
  function act(unit: KitchenUnit, action: Action['action']) {
    let reason = '';
    if (action === 'force') {
      if (!window.confirm(`Force-complete ALL remaining units of ${unit.orderNumber}?`)) return;
      const value = window.prompt('Reason (optional):', '');
      if (value === null) return;
      reason = value;
    }
    setError('');
    startTransition(async () => {
      optimistic({ unitId: unit.id, orderId: unit.orderId, action, at: new Date().toISOString() });
      try {
        if (action === 'force')
          await apiSend('POST', `/kitchen/orders/${unit.orderId}/force-complete`, {
            version: unit.orderVersion,
            reason,
          });
        else await apiSend('POST', `/kitchen/units/${unit.id}/${action}`, {});
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update kitchen work');
      }
      router.refresh();
    });
  }
  const totals = data.stations.reduce(
    (a, s) => ({
      total: a.total + s.total,
      done: a.done + s.done,
      late: a.late + s.late,
      atRisk: a.atRisk + s.atRisk,
    }),
    { total: 0, done: 0, late: 0, atRisk: 0 },
  );
  const stations = data.stations.filter((s) => !stationId || (s.id ?? 'unassigned') === stationId);
  return (
    <div className="space-y-4" aria-busy={pending}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Remaining units', totals.total - totals.done],
          ['Completed units', totals.done],
          ['Late units', totals.late],
          ['At-risk units', totals.atRisk],
        ].map(([label, n]) => (
          <div key={label} className="rounded-lg border p-3">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{n}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Totals cover all stations for this date; cards are filtered and paginated. Updated{' '}
        {formatKitchenDateTime(new Date(data.asOf))}. Refreshes every 15 seconds while visible.
      </p>
      <FormError message={error} />
      {!units.length && (
        <p className="rounded-lg border p-6 text-muted-foreground">
          No units match this view. Try another date, station or work status.
        </p>
      )}
      <div className="grid min-w-0 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {stations.map((station) => {
          const cards = units.filter((u) => u.stationId === station.id);
          return (
            <section
              key={station.id ?? 'unassigned'}
              className="min-w-0 space-y-3 rounded-lg bg-muted/30 p-3"
            >
              <div>
                <h2 className="font-heading text-xl font-bold">{station.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {station.total - station.done} remaining · {station.started} started ·{' '}
                  {station.done} done
                </p>
              </div>
              {cards.map((unit) => (
                <article
                  key={unit.id}
                  className={cn(
                    'space-y-3 rounded-lg border bg-background p-4',
                    unit.urgency === 'LATE' && 'border-red-400 bg-red-50/50',
                    unit.urgency === 'AT_RISK' && 'border-amber-400 bg-amber-50/50',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-semibold">
                      {unit.quantity} × {unit.dishName}
                    </h3>
                    <Badge
                      variant="outline"
                      className={cn(
                        unit.urgency === 'LATE' && 'text-red-700',
                        unit.urgency === 'AT_RISK' && 'text-amber-800',
                      )}
                    >
                      {LABEL[unit.urgency]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {unit.sku} · {unit.temperature === 'HOT' ? 'Hot' : 'Cold'} ·{' '}
                    {unit.startedAt && !unit.doneAt
                      ? 'Started'
                      : unit.doneAt
                        ? 'Completed'
                        : 'Not started'}
                  </p>
                  <ul className="space-y-1 text-sm">
                    {unit.choices.map((choice, i) => (
                      <li key={i}>
                        {choice.groupName}: <span className="font-medium">{choice.name}</span>
                      </li>
                    ))}
                    {!unit.choices.length && <li className="text-muted-foreground">No options</li>}
                  </ul>
                  <div className="space-y-1 border-t pt-2 text-sm">
                    <p>
                      {readOrders ? (
                        <Link
                          href={`/orders/${unit.orderId}`}
                          className="font-medium text-primary underline"
                        >
                          {unit.orderNumber}
                        </Link>
                      ) : (
                        unit.orderNumber
                      )}{' '}
                      · {unit.employeeName}
                    </p>
                    <p>
                      {unit.companyName} · {unit.packagingName}
                    </p>
                    <p>
                      Kitchen-ready: {formatKitchenDateTime(new Date(unit.plannedKitchenReadyAt))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Dispatch-ready {formatKitchenDateTime(new Date(unit.plannedDispatchReadyAt))}{' '}
                      · delivery {formatTimeOfDay(unit.deliveryTimeMinutes)}
                    </p>
                    {unit.notes && <p className="break-words">Note: {unit.notes}</p>}
                  </div>
                  {work && !unit.doneAt && (
                    <div className="flex flex-wrap gap-2">
                      {!unit.startedAt && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => act(unit, 'start')}
                        >
                          Start
                        </Button>
                      )}
                      <Button size="sm" disabled={pending} onClick={() => act(unit, 'done')}>
                        Mark done
                      </Button>
                    </div>
                  )}
                  {force && !unit.doneAt && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => act(unit, 'force')}
                    >
                      Force-complete entire order
                    </Button>
                  )}
                </article>
              ))}
              {!cards.length && (
                <p className="text-sm text-muted-foreground">No matching cards on this page.</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
