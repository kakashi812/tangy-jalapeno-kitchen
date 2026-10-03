'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { OptionInputSchema, type OptionDetail, type ReferenceItem } from '@fernleaf/shared';
import { CheckboxList } from '@/components/form/checkbox-list';
import { Field, FormError } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiSend } from '@/lib/api/client';
import { showServerErrors } from '@/lib/forms';
import { DollarInputSchema, centsToDollarInput, dollarsToCents } from '@/lib/money-input';

const FormSchema = OptionInputSchema.omit({ costCents: true }).extend({ cost: DollarInputSchema });
type FormValues = z.infer<typeof FormSchema>;

function toFormValues(option?: OptionDetail): FormValues {
  return {
    name: option?.name ?? '',
    cost: option?.costCents !== undefined ? centsToDollarInput(option.costCents) : '',
    allergenIds: option?.allergens.map((a) => a.id) ?? [],
    dietaryTagIds: option?.dietaryTags.map((t) => t.id) ?? [],
    isActive: option?.isActive ?? true,
  };
}

export function OptionForm({
  option,
  allergens,
  dietaryTags,
  readOnly = false,
}: {
  option?: OptionDetail;
  allergens: ReferenceItem[];
  dietaryTags: ReferenceItem[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const initial = toFormValues(option);
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<FormValues>({ resolver: zodResolver(FormSchema), defaultValues: initial });

  async function onSubmit({ cost, ...rest }: FormValues) {
    const body = { ...rest, costCents: dollarsToCents(cost) };
    try {
      if (option) {
        const saved = await apiSend<OptionDetail>('PUT', `/options/${option.id}`, body);
        reset(toFormValues(saved));
        router.refresh();
      } else {
        const created = await apiSend<OptionDetail>('POST', '/options', body);
        router.push(`/catalogue/options/${created.id}`);
        router.refresh();
      }
    } catch (error) {
      if (error instanceof ApiRequestError && error.fieldErrors.costCents) {
        error.fieldErrors.cost = error.fieldErrors.costCents;
      }
      showServerErrors(error, setError);
    }
  }

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
          {!readOnly || option?.costCents !== undefined ? (
            <Field
              id="cost"
              label="Cost price ($)"
              hint="Internal only."
              error={errors.cost?.message}
            >
              <Input
                id="cost"
                inputMode="decimal"
                placeholder="1.20"
                defaultValue={initial.cost}
                aria-invalid={!!errors.cost}
                {...register('cost')}
              />
            </Field>
          ) : null}
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Allergens</legend>
          <Controller
            control={control}
            name="allergenIds"
            render={({ field }) => (
              <CheckboxList
                items={allergens}
                value={field.value}
                onChange={field.onChange}
                disabled={readOnly}
              />
            )}
          />
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Dietary tags</legend>
          <Controller
            control={control}
            name="dietaryTagIds"
            render={({ field }) => (
              <CheckboxList
                items={dietaryTags}
                value={field.value}
                onChange={field.onChange}
                disabled={readOnly}
              />
            )}
          />
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
          Active (inactive options can&apos;t be added to dishes or chosen on new orders)
        </label>
      </fieldset>
      {!readOnly ? (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSubmitting || (option && !isDirty)}>
            {isSubmitting ? 'Saving…' : option ? 'Save option' : 'Create option'}
          </Button>
          {option && isSubmitSuccessful && !isDirty ? (
            <span className="text-sm text-muted-foreground" role="status">
              Saved
            </span>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

export function DeleteOptionButton({ option }: { option: OptionDetail }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function remove() {
    if (!window.confirm(`Delete "${option.name}"?`)) return;
    setPending(true);
    setError(undefined);
    try {
      await apiSend('DELETE', `/options/${option.id}`);
      router.push('/catalogue/options');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not reach the server.');
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <FormError message={error} />
      <Button variant="destructive" onClick={remove} disabled={pending || option.usedBy.length > 0}>
        Delete option
      </Button>
      {option.usedBy.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Offered by {option.usedBy.length} dish{option.usedBy.length === 1 ? '' : 'es'}, so it
          can&apos;t be deleted. Deactivate it instead, or remove it from those dishes first.
        </p>
      ) : null}
    </div>
  );
}
