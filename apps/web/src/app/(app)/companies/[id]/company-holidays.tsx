'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CompanyHolidayInputSchema,
  formatKitchenDate,
  type CompanyHoliday,
  type CompanyHolidayInput,
  type IsoDate,
} from '@fernleaf/shared';
import { Field, FormError } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiSend } from '@/lib/api/client';
import { showServerErrors } from '@/lib/forms';
import { cn } from '@/lib/utils';

/** The company's own closures: no deliveries those days. They never move the kitchen cut-off. */
export function CompanyHolidays({
  companyId,
  holidays,
  today,
  canEdit,
}: {
  companyId: string;
  holidays: CompanyHoliday[];
  today: IsoDate;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CompanyHolidayInput>({
    resolver: zodResolver(CompanyHolidayInputSchema),
    defaultValues: { name: '', startDate: '', endDate: '' },
  });

  async function add(values: CompanyHolidayInput) {
    try {
      await apiSend('POST', `/companies/${companyId}/holidays`, values);
      reset();
      router.refresh();
    } catch (err) {
      showServerErrors(err, setFieldError);
    }
  }

  async function remove(holiday: CompanyHoliday) {
    setError(undefined);
    try {
      await apiSend('DELETE', `/companies/${companyId}/holidays/${holiday.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not reach the server.');
    }
  }

  return (
    <div className="max-w-2xl space-y-3">
      <FormError message={error} />
      {holidays.length === 0 ? (
        <p className="text-sm text-muted-foreground">No company holidays.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {holidays.map((holiday) => (
            <li
              key={holiday.id}
              className={cn(
                'flex items-center justify-between px-4 py-2 text-sm',
                holiday.endDate < today && 'opacity-50',
              )}
            >
              <span>
                <span className="font-medium">{holiday.name}</span>{' '}
                <span className="text-muted-foreground">
                  {holiday.startDate === holiday.endDate
                    ? formatKitchenDate(holiday.startDate)
                    : `${formatKitchenDate(holiday.startDate)} – ${formatKitchenDate(holiday.endDate)}`}
                </span>
              </span>
              {canEdit ? (
                <Button size="sm" variant="ghost" onClick={() => remove(holiday)}>
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <form onSubmit={handleSubmit(add)} className="space-y-2 rounded-lg border p-4" noValidate>
          <FormError message={errors.root?.server?.message} />
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
            <Field id="ch-name" label="Holiday" error={errors.name?.message}>
              <Input id="ch-name" placeholder="e.g. Annual offsite" {...register('name')} />
            </Field>
            <Field id="ch-start" label="From" error={errors.startDate?.message}>
              <Input id="ch-start" type="date" {...register('startDate')} />
            </Field>
            <Field id="ch-end" label="To (inclusive)" error={errors.endDate?.message}>
              <Input id="ch-end" type="date" {...register('endDate')} />
            </Field>
            <Button type="submit" variant="outline" disabled={isSubmitting}>
              Add
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
