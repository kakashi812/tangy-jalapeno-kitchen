'use client';

import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { WEEKDAYS, formatTimeOfDay, parseTimeOfDay, type Settings } from '@fernleaf/shared';
import { Field, FormError } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiSend } from '@/lib/api/client';
import { showServerErrors } from '@/lib/forms';

const wholeNumber = (min: number, max: number) =>
  z
    .number({ error: 'Enter a whole number' })
    .int('Enter a whole number')
    .min(min, `Use ${min} or more`)
    .max(max, `Use ${max} or less`);

/** The form edits the cut-off time as "HH:mm"; the API stores minutes after midnight. */
const FormSchema = z
  .object({
    kitchenWorkingDays: z.array(z.number()).min(1, 'Pick at least one working day'),
    cutoffDaysBefore: wholeNumber(0, 14),
    cutoffTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time'),
    kitchenReadyBufferMinutes: wholeNumber(0, 240),
    atRiskMinutes: wholeNumber(0, 240),
    deliveryWindowStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time'),
    deliveryWindowEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time'),
  })
  .refine((v) => v.deliveryWindowEnd > v.deliveryWindowStart, {
    path: ['deliveryWindowEnd'],
    message: 'Must be after the start',
  });
type FormValues = z.infer<typeof FormSchema>;

/** Monday first, the way a kitchen reads its week. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function toFormValues(settings: Settings): FormValues {
  const { cutoffTimeMinutes, deliveryWindowStartMinutes, deliveryWindowEndMinutes, ...rest } =
    settings;
  return {
    ...rest,
    cutoffTime: formatTimeOfDay(cutoffTimeMinutes),
    deliveryWindowStart: formatTimeOfDay(deliveryWindowStartMinutes),
    deliveryWindowEnd: formatTimeOfDay(deliveryWindowEndMinutes),
  };
}

export function SettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: toFormValues(settings),
  });

  async function onSubmit({
    cutoffTime,
    deliveryWindowStart,
    deliveryWindowEnd,
    ...rest
  }: FormValues) {
    try {
      const saved = await apiSend<Settings>('PUT', '/settings', {
        ...rest,
        cutoffTimeMinutes: parseTimeOfDay(cutoffTime),
        deliveryWindowStartMinutes: parseTimeOfDay(deliveryWindowStart),
        deliveryWindowEndMinutes: parseTimeOfDay(deliveryWindowEnd),
      });
      reset(toFormValues(saved));
      router.refresh(); // re-renders the cut-off preview with the new rules
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const f = error.fieldErrors;
        // The API reports times in minutes under their own names.
        if (f.cutoffTimeMinutes) f.cutoffTime = f.cutoffTimeMinutes;
        if (f.deliveryWindowStartMinutes) f.deliveryWindowStart = f.deliveryWindowStartMinutes;
        if (f.deliveryWindowEndMinutes) f.deliveryWindowEnd = f.deliveryWindowEndMinutes;
      }
      showServerErrors(error, setError);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-xl space-y-5" noValidate>
      <FormError message={errors.root?.server?.message} />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Kitchen working days</legend>
        <Controller
          control={control}
          name="kitchenWorkingDays"
          render={({ field }) => (
            <div className="flex flex-wrap gap-4">
              {WEEK_ORDER.map((day) => (
                <label key={day} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={field.value.includes(day)}
                    onCheckedChange={(checked) =>
                      field.onChange(
                        checked ? [...field.value, day] : field.value.filter((d) => d !== day),
                      )
                    }
                  />
                  {WEEKDAYS[day]}
                </label>
              ))}
            </div>
          )}
        />
        {errors.kitchenWorkingDays?.message ? (
          <p className="text-sm text-destructive" role="alert">
            {errors.kitchenWorkingDays.message}
          </p>
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="cutoffDaysBefore"
          label="Cut-off: working days before delivery"
          hint="Kitchen working days, not counting the delivery day."
          error={errors.cutoffDaysBefore?.message}
        >
          <Input
            id="cutoffDaysBefore"
            type="number"
            min={0}
            max={14}
            aria-invalid={!!errors.cutoffDaysBefore}
            defaultValue={settings.cutoffDaysBefore}
            {...register('cutoffDaysBefore', { valueAsNumber: true })}
          />
        </Field>
        <Field
          id="cutoffTime"
          label="Cut-off time (kitchen time, IST)"
          error={errors.cutoffTime?.message}
        >
          <Input
            id="cutoffTime"
            type="time"
            aria-invalid={!!errors.cutoffTime}
            defaultValue={formatTimeOfDay(settings.cutoffTimeMinutes)}
            {...register('cutoffTime')}
          />
        </Field>
        <Field
          id="kitchenReadyBufferMinutes"
          label="Kitchen-ready buffer (minutes)"
          hint="Planned kitchen-ready = planned dispatch-ready minus this."
          error={errors.kitchenReadyBufferMinutes?.message}
        >
          <Input
            id="kitchenReadyBufferMinutes"
            type="number"
            min={0}
            max={240}
            aria-invalid={!!errors.kitchenReadyBufferMinutes}
            defaultValue={settings.kitchenReadyBufferMinutes}
            {...register('kitchenReadyBufferMinutes', { valueAsNumber: true })}
          />
        </Field>
        <Field
          id="atRiskMinutes"
          label="At-risk warning (minutes)"
          hint="Kitchen work not started this close to planned kitchen-ready is flagged."
          error={errors.atRiskMinutes?.message}
        >
          <Input
            id="atRiskMinutes"
            type="number"
            min={0}
            max={240}
            aria-invalid={!!errors.atRiskMinutes}
            defaultValue={settings.atRiskMinutes}
            {...register('atRiskMinutes', { valueAsNumber: true })}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="deliveryWindowStart"
          label="Earliest delivery time"
          hint="Delivery times can be set between these two times."
          error={errors.deliveryWindowStart?.message}
        >
          <Input
            id="deliveryWindowStart"
            type="time"
            step={900}
            defaultValue={formatTimeOfDay(settings.deliveryWindowStartMinutes)}
            aria-invalid={!!errors.deliveryWindowStart}
            {...register('deliveryWindowStart')}
          />
        </Field>
        <Field
          id="deliveryWindowEnd"
          label="Latest delivery time"
          error={errors.deliveryWindowEnd?.message}
        >
          <Input
            id="deliveryWindowEnd"
            type="time"
            step={900}
            defaultValue={formatTimeOfDay(settings.deliveryWindowEndMinutes)}
            aria-invalid={!!errors.deliveryWindowEnd}
            {...register('deliveryWindowEnd')}
          />
        </Field>
      </div>

      <p className="text-sm text-muted-foreground">
        Changes apply to new orders only. Each order keeps the cut-off it was given when it was
        created.
      </p>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? 'Saving…' : 'Save settings'}
        </Button>
        {isSubmitSuccessful && !isDirty ? (
          <span className="text-sm text-muted-foreground" role="status">
            Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}
