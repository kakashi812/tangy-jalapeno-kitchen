'use client';

import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DishInputSchema, type DishDetail, type ReferenceItem } from '@fernleaf/shared';
import { CheckboxList } from '@/components/form/checkbox-list';
import { Field, FormError, selectClassName, textareaClassName } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiSend } from '@/lib/api/client';
import { showServerErrors } from '@/lib/forms';
import { DollarInputSchema, centsToDollarInput, dollarsToCents } from '@/lib/money-input';

/**
 * The form edits cost as dollars and the minimum quantity as text (empty = none); everything else
 * comes straight from the shared DishInputSchema, so the browser checks the same rules as the API.
 */
const FormSchema = DishInputSchema.omit({ costCents: true, minOrderQty: true }).extend({
  cost: DollarInputSchema,
  minOrderQty: z
    .string()
    .trim()
    .regex(/^(\d+)?$/, 'Enter a whole number or leave empty'),
});
type FormInput = z.input<typeof FormSchema>;
type FormValues = z.output<typeof FormSchema>;

export type DishFormRefs = {
  stations: ReferenceItem[];
  allergens: ReferenceItem[];
  dietaryTags: ReferenceItem[];
};

function toFormInput(dish?: DishDetail): FormInput {
  return {
    name: dish?.name ?? '',
    description: dish?.description ?? '',
    sku: dish?.sku ?? '',
    temperature: dish?.temperature ?? 'HOT',
    cost: dish?.costCents !== undefined ? centsToDollarInput(dish.costCents) : '',
    stationId: dish?.station?.id ?? null,
    minOrderQty: dish?.minOrderQty ? String(dish.minOrderQty) : '',
    allergenIds: dish?.allergens.map((a) => a.id) ?? [],
    dietaryTagIds: dish?.dietaryTags.map((t) => t.id) ?? [],
    isActive: dish?.isActive ?? true,
  };
}

export function DishForm({
  dish,
  refs,
  readOnly = false,
}: {
  dish?: DishDetail;
  refs: DishFormRefs;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const initial = toFormInput(dish);
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: initial,
  });

  async function onSubmit({ cost, minOrderQty, ...rest }: FormValues) {
    const body = {
      ...rest,
      costCents: dollarsToCents(cost),
      minOrderQty: minOrderQty ? Number(minOrderQty) : null,
    };
    try {
      const saved = dish
        ? await apiSend<DishDetail>('PUT', `/dishes/${dish.id}`, body)
        : await apiSend<DishDetail>('POST', '/dishes', body);
      if (dish) {
        reset(toFormInput(saved));
        router.refresh();
      } else {
        router.push(`/catalogue/dishes/${saved.id}`);
        router.refresh();
      }
    } catch (error) {
      // The API reports money and quantity under their API names.
      if (error instanceof ApiRequestError) {
        if (error.fieldErrors.costCents) error.fieldErrors.cost = error.fieldErrors.costCents;
      }
      showServerErrors(error, setError);
    }
  }

  const showCost = !readOnly || dish?.costCents !== undefined;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-5" noValidate>
      <fieldset disabled={readOnly} className="space-y-5">
        <FormError message={errors.root?.server?.message} />
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field id="name" label="Name" error={errors.name?.message}>
            <Input
              id="name"
              defaultValue={initial.name}
              aria-invalid={!!errors.name}
              {...register('name')}
            />
          </Field>
          <Field id="sku" label="SKU" hint="e.g. BWL-PAN-01" error={errors.sku?.message}>
            <Input
              id="sku"
              defaultValue={initial.sku}
              className="uppercase"
              aria-invalid={!!errors.sku}
              {...register('sku')}
            />
          </Field>
        </div>

        <Field id="description" label="Description" error={errors.description?.message}>
          <textarea
            id="description"
            defaultValue={initial.description}
            className={textareaClassName}
            aria-invalid={!!errors.description}
            {...register('description')}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Served</legend>
            <div className="flex h-9 items-center gap-4">
              {(['HOT', 'COLD'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    value={t}
                    defaultChecked={initial.temperature === t}
                    {...register('temperature')}
                  />
                  {t === 'HOT' ? 'Hot' : 'Cold'}
                </label>
              ))}
            </div>
          </fieldset>
          {showCost ? (
            <Field
              id="cost"
              label="Cost price ($)"
              hint="What it costs the kitchen to make. Internal only."
              error={errors.cost?.message}
            >
              <Input
                id="cost"
                inputMode="decimal"
                defaultValue={initial.cost}
                placeholder="3.10"
                aria-invalid={!!errors.cost}
                {...register('cost')}
              />
            </Field>
          ) : null}
          <Field
            id="minOrderQty"
            label="Minimum per order"
            hint="Optional. Leave empty for no minimum."
            error={errors.minOrderQty?.message}
          >
            <Input
              id="minOrderQty"
              inputMode="numeric"
              defaultValue={initial.minOrderQty}
              aria-invalid={!!errors.minOrderQty}
              {...register('minOrderQty')}
            />
          </Field>
        </div>

        <Field
          id="stationId"
          label="Kitchen station"
          hint="Where it's cooked. Without one it appears under 'Unassigned' on the kitchen board."
          error={errors.stationId?.message}
        >
          <Controller
            control={control}
            name="stationId"
            render={({ field }) => (
              <select
                id="stationId"
                className={`${selectClassName} max-w-xs`}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value || null)}
              >
                <option value="">Unassigned</option>
                {refs.stations
                  .filter((s) => s.isActive || s.id === field.value)
                  .map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name}
                    </option>
                  ))}
              </select>
            )}
          />
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Allergens</legend>
          <Controller
            control={control}
            name="allergenIds"
            render={({ field }) => (
              <CheckboxList
                items={refs.allergens}
                value={field.value}
                onChange={field.onChange}
                disabled={readOnly}
              />
            )}
          />
          {errors.allergenIds?.message ? (
            <p className="text-sm text-destructive">{errors.allergenIds.message}</p>
          ) : null}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Dietary tags</legend>
          <Controller
            control={control}
            name="dietaryTagIds"
            render={({ field }) => (
              <CheckboxList
                items={refs.dietaryTags}
                value={field.value}
                onChange={field.onChange}
                disabled={readOnly}
              />
            )}
          />
          {errors.dietaryTagIds?.message ? (
            <p className="text-sm text-destructive">{errors.dietaryTagIds.message}</p>
          ) : null}
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <Checkbox
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={readOnly}
              />
            )}
          />
          Active (inactive dishes can&apos;t be ordered; past orders keep them)
        </label>
      </fieldset>

      {!readOnly ? (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSubmitting || (dish && !isDirty)}>
            {isSubmitting ? 'Saving…' : dish ? 'Save dish' : 'Create dish'}
          </Button>
          {dish && isSubmitSuccessful && !isDirty ? (
            <span className="text-sm text-muted-foreground" role="status">
              Saved
            </span>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
