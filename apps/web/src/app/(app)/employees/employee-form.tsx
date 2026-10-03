'use client';

import { useRouter } from 'next/navigation';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  EmployeeInputSchema,
  type CompanySummary,
  type EmployeeInput,
  type EmployeeSummary,
  type ReferenceItem,
} from '@fernleaf/shared';
import { CheckboxList } from '@/components/form/checkbox-list';
import { Field, FormError, selectClassName } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { apiSend } from '@/lib/api/client';
import { showServerErrors } from '@/lib/forms';

type Values = z.output<typeof EmployeeInputSchema>;

const FLAGS = [
  {
    name: 'canChooseAddress',
    label: 'Can choose their delivery address',
    help: 'From the company’s addresses',
  },
  {
    name: 'canChangeDeliveryTime',
    label: 'Can change the delivery time',
    help: 'Within the delivery window',
  },
  {
    name: 'canChangePackaging',
    label: 'Can change packaging',
    help: 'Otherwise the company default',
  },
] as const;

export function EmployeeForm({
  employee,
  companyId,
  companies,
  allergens,
  dietaryTags,
}: {
  employee?: EmployeeSummary;
  companyId?: string;
  companies: Pick<CompanySummary, 'id' | 'name' | 'domains'>[];
  allergens: ReferenceItem[];
  dietaryTags: ReferenceItem[];
}) {
  const router = useRouter();
  const initial: EmployeeInput = {
    companyId: employee?.company.id ?? companyId ?? '',
    name: employee?.name ?? '',
    email: employee?.email ?? '',
    phone: employee?.phone ?? '',
    canChooseAddress: employee?.canChooseAddress ?? false,
    canChangeDeliveryTime: employee?.canChangeDeliveryTime ?? false,
    canChangePackaging: employee?.canChangePackaging ?? false,
    allergenIds: employee?.allergies.map((a) => a.id) ?? [],
    dietaryTagIds: employee?.dietaryPreferences.map((d) => d.id) ?? [],
  };
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<EmployeeInput, unknown, Values>({
    resolver: zodResolver(EmployeeInputSchema),
    defaultValues: initial,
  });
  const selectedCompanyId = useWatch({ control, name: 'companyId' });
  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);
  const moving = employee && selectedCompany && selectedCompany.id !== employee.company.id;

  async function onSubmit(values: Values) {
    try {
      const saved = employee
        ? await apiSend<EmployeeSummary>('PUT', `/employees/${employee.id}`, values)
        : await apiSend<EmployeeSummary>('POST', '/employees', values);
      if (employee) {
        reset({
          ...values,
          allergenIds: saved.allergies.map((a) => a.id),
          dietaryTagIds: saved.dietaryPreferences.map((d) => d.id),
        });
        router.refresh();
      } else {
        router.push(`/employees/${saved.id}`);
        router.refresh();
      }
    } catch (error) {
      showServerErrors(error, setError);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6" noValidate>
      <FormError message={errors.root?.server?.message} />
      <Field
        id="companyId"
        label="Company"
        hint={
          moving ? 'Moving changes which prices, menu and delivery rules apply to them.' : undefined
        }
        error={errors.companyId?.message}
      >
        <select
          id="companyId"
          className={`${selectClassName} max-w-sm`}
          defaultValue={initial.companyId}
          {...register('companyId')}
        >
          <option value="">Choose a company…</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Name" error={errors.name?.message}>
          <Input
            id="name"
            defaultValue={initial.name}
            aria-invalid={!!errors.name}
            {...register('name')}
          />
        </Field>
        <Field
          id="email"
          label="Work email"
          hint={
            selectedCompany
              ? `Must be on ${selectedCompany.domains.map((d) => `@${d}`).join(' or ')}`
              : undefined
          }
          error={errors.email?.message}
        >
          <Input
            id="email"
            type="email"
            defaultValue={initial.email}
            aria-invalid={!!errors.email}
            {...register('email')}
          />
        </Field>
        <Field id="phone" label="Phone (optional)" error={errors.phone?.message}>
          <Input id="phone" defaultValue={initial.phone} {...register('phone')} />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">When ordering for them, staff may…</legend>
        {FLAGS.map((flag) => (
          <label key={flag.name} className="flex items-start gap-2 text-sm">
            <Controller
              control={control}
              name={flag.name}
              render={({ field }) => (
                <Checkbox
                  className="mt-0.5"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <span>
              {flag.label}
              <span className="block text-xs text-muted-foreground">{flag.help}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Allergies</legend>
        <p className="text-xs text-muted-foreground">
          Dishes containing these are flagged when ordering for them.
        </p>
        <Controller
          control={control}
          name="allergenIds"
          render={({ field }) => (
            <CheckboxList items={allergens} value={field.value} onChange={field.onChange} />
          )}
        />
        {errors.allergenIds?.message ? (
          <p className="text-sm text-destructive">{errors.allergenIds.message}</p>
        ) : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Dietary preferences</legend>
        <Controller
          control={control}
          name="dietaryTagIds"
          render={({ field }) => (
            <CheckboxList items={dietaryTags} value={field.value} onChange={field.onChange} />
          )}
        />
        {errors.dietaryTagIds?.message ? (
          <p className="text-sm text-destructive">{errors.dietaryTagIds.message}</p>
        ) : null}
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting || (employee && !isDirty)}>
          {isSubmitting
            ? 'Saving…'
            : employee
              ? moving
                ? 'Save and move'
                : 'Save employee'
              : 'Add employee'}
        </Button>
        {employee && isSubmitSuccessful && !isDirty ? (
          <span className="text-sm text-muted-foreground" role="status">
            Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}
