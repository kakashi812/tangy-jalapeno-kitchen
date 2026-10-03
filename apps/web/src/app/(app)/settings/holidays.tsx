'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  HolidayInputSchema,
  formatKitchenDate,
  type HolidayInput,
  type IsoDate,
  type KitchenHoliday,
} from '@fernleaf/shared';
import { Field, FormError } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiSend } from '@/lib/api/client';
import { showServerErrors } from '@/lib/forms';
import { cn } from '@/lib/utils';

function describeRange({ startDate, endDate }: { startDate: IsoDate; endDate: IsoDate }) {
  return startDate === endDate
    ? formatKitchenDate(startDate)
    : `${formatKitchenDate(startDate)} – ${formatKitchenDate(endDate)}`;
}

function DeleteHoliday({ holiday }: { holiday: KitchenHoliday }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function remove() {
    if (!window.confirm(`Remove "${holiday.name}"? The kitchen will count it as a working day.`)) {
      return;
    }
    setPending(true);
    try {
      await apiSend('DELETE', `/kitchen-holidays/${holiday.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not reach the server.');
      setPending(false);
    }
  }

  return (
    <div className="text-right">
      <Button variant="ghost" size="sm" onClick={remove} disabled={pending}>
        Remove
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function AddHolidayForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<HolidayInput>({
    resolver: zodResolver(HolidayInputSchema),
    defaultValues: { name: '', startDate: '', endDate: '' },
  });

  async function onSubmit(values: HolidayInput) {
    try {
      await apiSend('POST', '/kitchen-holidays', values);
      reset();
      router.refresh();
    } catch (error) {
      showServerErrors(error, setError);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 rounded-lg border p-4" noValidate>
      <h3 className="text-sm font-medium">Add a closure</h3>
      <FormError message={errors.root?.server?.message} />
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Field id="holiday-name" label="Name" error={errors.name?.message}>
          <Input
            id="holiday-name"
            placeholder="e.g. Diwali break"
            aria-invalid={!!errors.name}
            {...register('name')}
          />
        </Field>
        <Field id="holiday-start" label="From" error={errors.startDate?.message}>
          <Input
            id="holiday-start"
            type="date"
            aria-invalid={!!errors.startDate}
            {...register('startDate')}
          />
        </Field>
        <Field id="holiday-end" label="To (inclusive)" error={errors.endDate?.message}>
          <Input
            id="holiday-end"
            type="date"
            aria-invalid={!!errors.endDate}
            {...register('endDate')}
          />
        </Field>
      </div>
      <Button type="submit" variant="outline" disabled={isSubmitting}>
        {isSubmitting ? 'Adding…' : 'Add closure'}
      </Button>
    </form>
  );
}

export function KitchenHolidays({
  holidays,
  today,
}: {
  holidays: KitchenHoliday[];
  today: IsoDate;
}) {
  return (
    <div className="max-w-2xl space-y-4">
      {holidays.length === 0 ? (
        <p className="text-sm text-muted-foreground">No closures planned.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {holidays.map((holiday) => {
            const past = holiday.endDate < today;
            return (
              <li
                key={holiday.id}
                className={cn(
                  'flex items-center justify-between gap-4 px-4 py-2',
                  past && 'opacity-50',
                )}
              >
                <div>
                  <div className="text-sm font-medium">{holiday.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {describeRange(holiday)}
                    {past ? ' · past' : ''}
                  </div>
                </div>
                <DeleteHoliday holiday={holiday} />
              </li>
            );
          })}
        </ul>
      )}
      <AddHolidayForm />
    </div>
  );
}
