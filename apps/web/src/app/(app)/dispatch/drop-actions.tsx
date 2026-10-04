'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { DropSummary } from '@fernleaf/shared';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/form/field';
import { apiSend } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/api-error';
import { selectClassName } from '@/components/form/field';

export type DriverChoice = { id: string; name: string };
export function RefreshDrops() {
  const router = useRouter();
  const [pending, transition] = useTransition();
  useEffect(() => {
    const timer = setInterval(() => {
      if (!pending && document.visibilityState === 'visible') transition(() => router.refresh());
    }, 15000);
    return () => clearInterval(timer);
  }, [pending, router]);
  return null;
}
export function DropActions({
  drop,
  drivers,
  assign,
  advance,
}: {
  drop: DropSummary;
  drivers: DriverChoice[];
  assign: boolean;
  advance: boolean;
}) {
  const router = useRouter();
  const [pending, transition] = useTransition();
  const [error, setError] = useState('');
  const editable = !['OUT_FOR_DELIVERY', 'DELIVERED'].includes(drop.state);
  function send(action: 'ready' | 'depart' | 'driver', driverId?: string) {
    setError('');
    transition(async () => {
      try {
        await apiSend(action === 'driver' ? 'PUT' : 'POST', `/drops/${drop.id}/${action}`, {
          version: drop.version,
          ...(action === 'driver' && { driverId: driverId || null }),
        });
      } catch (error) {
        setError(
          error instanceof ApiRequestError && Object.keys(error.fieldErrors).length
            ? Object.values(error.fieldErrors).flat().join(' ')
            : error instanceof Error
              ? error.message
              : 'Could not update drop',
        );
      }
      router.refresh();
    });
  }
  return (
    <div className="space-y-3">
      <FormError message={error} />
      {assign && editable && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            send('driver', String(new FormData(event.currentTarget).get('driverId') ?? ''));
          }}
        >
          <select
            key={drop.driver?.id ?? 'none'}
            className={selectClassName}
            name="driverId"
            aria-label="Assigned driver"
            defaultValue={drop.driver?.id ?? ''}
            disabled={pending}
          >
            <option value="">Unassigned</option>
            {drop.driver && !drivers.some((driver) => driver.id === drop.driver?.id) && (
              <option value={drop.driver.id}>{drop.driver.name} (unavailable)</option>
            )}
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            Save driver
          </Button>
        </form>
      )}
      {advance && drop.state === 'KITCHEN_READY' && (
        <Button disabled={pending} onClick={() => send('ready')}>
          Mark dispatch ready
        </Button>
      )}
      {advance && drop.state === 'DISPATCH_READY' && (
        <Button disabled={pending || !drop.driver?.isActive} onClick={() => send('depart')}>
          Send out for delivery
        </Button>
      )}
      {drop.state === 'DISPATCH_READY' && !drop.driver?.isActive && (
        <p className="text-sm text-amber-700">Assign an active driver before departure.</p>
      )}
    </div>
  );
}
