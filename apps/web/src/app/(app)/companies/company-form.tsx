'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { z } from 'zod';
import {
  EmailDomainSchema,
  WEEKDAYS,
  formatTimeOfDay,
  parseTimeOfDay,
  type CompanyDetail,
  type DriverOption,
  type ReferenceItem,
  type TierSummary,
} from '@fernleaf/shared';
import { Field, FormError, selectClassName, textareaClassName } from '@/components/form/field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiSend } from '@/lib/api/client';
import { showServerErrors } from '@/lib/forms';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Mirrors the shared CompanyInputSchema, with the delivery time edited as "HH:mm". */
const FormSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(100),
  isActive: z.boolean(),
  domains: z.array(z.string()).min(1, 'Add at least one email domain'),
  priceTierId: z.string(),
  billingContactName: z.string().trim().min(1, 'Enter a billing contact').max(100),
  billingEmail: z.email('Enter a valid email'),
  billingPhone: z.string().trim().max(30),
  workingDays: z.array(z.number()).min(1, 'Pick at least one working day'),
  deliveryTime: z
    .string()
    .regex(TIME, 'Enter a time')
    .refine((t) => parseTimeOfDay(t) % 15 === 0, 'Use a quarter hour, e.g. 12:30'),
  dispatchLeadMinutes: z
    .number({ error: 'Enter a number of minutes' })
    .int()
    .min(0)
    .max(480, 'At most 480 minutes'),
  defaultPackagingTypeId: z.string().min(1, 'Choose a packaging type'),
  driverInstructions: z.string().trim().max(500),
  defaultDriverId: z.string(),
});
type FormValues = z.infer<typeof FormSchema>;

function toFormValues(company?: CompanyDetail): FormValues {
  return {
    name: company?.name ?? '',
    isActive: company?.isActive ?? true,
    domains: company?.domains ?? [],
    priceTierId: company?.priceTierId ?? '',
    billingContactName: company?.billingContactName ?? '',
    billingEmail: company?.billingEmail ?? '',
    billingPhone: company?.billingPhone ?? '',
    workingDays: company?.workingDays ?? [1, 2, 3, 4, 5],
    deliveryTime: formatTimeOfDay(company?.defaultDeliveryTimeMinutes ?? 12 * 60 + 30),
    dispatchLeadMinutes: company?.dispatchLeadMinutes ?? 60,
    defaultPackagingTypeId: company?.defaultPackagingType.id ?? '',
    driverInstructions: company?.driverInstructions ?? '',
    defaultDriverId: company?.defaultDriver?.id ?? '',
  };
}

/** Domains as removable chips; typed entries are checked with the shared schema before adding. */
function DomainsInput({
  value,
  onChange,
  errors,
}: {
  value: string[];
  onChange: (domains: string[]) => void;
  errors: Record<number, string>;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();

  function add() {
    const parsed = EmailDomainSchema.safeParse(draft);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    if (value.includes(parsed.data)) return setError('Already added');
    onChange([...value, parsed.data]);
    setDraft('');
    setError(undefined);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((domain, index) => (
          <Badge
            key={domain}
            variant={errors[index] ? 'destructive' : 'secondary'}
            className="gap-1 pr-1 text-sm"
          >
            @{domain}
            <button
              type="button"
              aria-label={`Remove ${domain}`}
              className="rounded p-0.5 hover:bg-background/60"
              onClick={() => onChange(value.filter((d) => d !== domain))}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex max-w-md gap-2">
        <Input
          aria-label="Add an email domain"
          placeholder="e.g. acme.com"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={add}>
          Add
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {Object.values(errors).map((message) => (
        <p key={message} className="text-sm text-destructive" role="alert">
          {message}
        </p>
      ))}
    </div>
  );
}

export function CompanyForm({
  company,
  tiers,
  packagingTypes,
  drivers,
}: {
  company?: CompanyDetail;
  tiers: TierSummary[];
  packagingTypes: ReferenceItem[];
  drivers: DriverOption[];
}) {
  const router = useRouter();
  const initial = toFormValues(company);
  const [domainErrors, setDomainErrors] = useState<Record<number, string>>({});
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<FormValues>({ resolver: zodResolver(FormSchema), defaultValues: initial });

  const defaultTier = tiers.find((t) => t.isDefault);
  const inactiveDriver =
    company?.defaultDriver && !company.defaultDriver.isActive ? company.defaultDriver : null;

  async function onSubmit({ deliveryTime, priceTierId, defaultDriverId, ...rest }: FormValues) {
    setDomainErrors({});
    const body = {
      ...rest,
      priceTierId: priceTierId || null,
      defaultDriverId: defaultDriverId || null,
      defaultDeliveryTimeMinutes: parseTimeOfDay(deliveryTime),
    };
    try {
      const saved = company
        ? await apiSend<CompanyDetail>('PUT', `/companies/${company.id}`, body)
        : await apiSend<CompanyDetail>('POST', '/companies', body);
      if (company) {
        reset(toFormValues(saved));
        router.refresh();
      } else {
        router.push(`/companies/${saved.id}`);
        router.refresh();
      }
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const f = error.fieldErrors;
        if (f.defaultDeliveryTimeMinutes) f.deliveryTime = f.defaultDeliveryTimeMinutes;
        // Per-domain errors ("domains.1") are shown on the chips.
        const perDomain: Record<number, string> = {};
        for (const [key, messages] of Object.entries(f)) {
          const match = /^domains\.(\d+)$/.exec(key);
          if (match) {
            perDomain[Number(match[1])] = messages.join(' ');
            delete f[key];
          }
        }
        setDomainErrors(perDomain);
      }
      showServerErrors(error, setError);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-8" noValidate>
      <FormError message={errors.root?.server?.message} />

      <fieldset className="space-y-4">
        <legend className="font-heading text-lg font-bold">Company</legend>
        <Field id="name" label="Company name" error={errors.name?.message}>
          <Input
            id="name"
            defaultValue={initial.name}
            aria-invalid={!!errors.name}
            {...register('name')}
          />
        </Field>
        <div className="space-y-1.5">
          <span className="text-sm font-medium">Email domains</span>
          <p className="text-xs text-muted-foreground">
            Employees&apos; emails must be on one of these. Two companies can&apos;t share a domain,
            and public domains (gmail.com…) aren&apos;t allowed.
          </p>
          <Controller
            control={control}
            name="domains"
            render={({ field }) => (
              <DomainsInput value={field.value} onChange={field.onChange} errors={domainErrors} />
            )}
          />
          {errors.domains?.message ? (
            <p className="text-sm text-destructive">{errors.domains.message}</p>
          ) : null}
        </div>
        <Field
          id="priceTierId"
          label="Price tier"
          hint="Which prices this company's employees see."
          error={errors.priceTierId?.message}
        >
          <select
            id="priceTierId"
            className={`${selectClassName} max-w-sm`}
            defaultValue={initial.priceTierId}
            {...register('priceTierId')}
          >
            <option value="">
              Default tier{defaultTier ? ` (currently ${defaultTier.name})` : ''}
            </option>
            {tiers.map((tier) => (
              <option key={tier.id} value={tier.id}>
                {tier.name}: {tier.ruleLabel}
              </option>
            ))}
          </select>
        </Field>
        {company ? (
          <label className="flex items-center gap-2 text-sm">
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
            Active (inactive companies can&apos;t receive new orders; existing orders carry on)
          </label>
        ) : null}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-lg font-bold">Billing contact</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="billingContactName" label="Name" error={errors.billingContactName?.message}>
            <Input
              id="billingContactName"
              defaultValue={initial.billingContactName}
              aria-invalid={!!errors.billingContactName}
              {...register('billingContactName')}
            />
          </Field>
          <Field id="billingEmail" label="Email" error={errors.billingEmail?.message}>
            <Input
              id="billingEmail"
              type="email"
              defaultValue={initial.billingEmail}
              aria-invalid={!!errors.billingEmail}
              {...register('billingEmail')}
            />
          </Field>
          <Field id="billingPhone" label="Phone" error={errors.billingPhone?.message}>
            <Input
              id="billingPhone"
              defaultValue={initial.billingPhone}
              {...register('billingPhone')}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-lg font-bold">Deliveries</legend>
        <div className="space-y-2">
          <span className="text-sm font-medium">Working days</span>
          <p className="text-xs text-muted-foreground">
            No deliveries on other days or on the company&apos;s holidays. This never moves the
            order cut-off; only the kitchen calendar does.
          </p>
          <Controller
            control={control}
            name="workingDays"
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
          {errors.workingDays?.message ? (
            <p className="text-sm text-destructive">{errors.workingDays.message}</p>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            id="deliveryTime"
            label="Default delivery time"
            error={errors.deliveryTime?.message}
          >
            <Input
              id="deliveryTime"
              type="time"
              step={900}
              defaultValue={initial.deliveryTime}
              aria-invalid={!!errors.deliveryTime}
              {...register('deliveryTime')}
            />
          </Field>
          <Field
            id="dispatchLeadMinutes"
            label="Leaves the kitchen (minutes before)"
            hint="Planned dispatch-ready = delivery time minus this."
            error={errors.dispatchLeadMinutes?.message}
          >
            <Input
              id="dispatchLeadMinutes"
              type="number"
              min={0}
              max={480}
              defaultValue={initial.dispatchLeadMinutes}
              aria-invalid={!!errors.dispatchLeadMinutes}
              {...register('dispatchLeadMinutes', { valueAsNumber: true })}
            />
          </Field>
          <Field
            id="defaultPackagingTypeId"
            label="Default packaging"
            error={errors.defaultPackagingTypeId?.message}
          >
            <select
              id="defaultPackagingTypeId"
              className={selectClassName}
              defaultValue={initial.defaultPackagingTypeId}
              {...register('defaultPackagingTypeId')}
            >
              <option value="">Choose…</option>
              {packagingTypes
                .filter((p) => p.isActive || p.id === initial.defaultPackagingTypeId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <Field
          id="defaultDriverId"
          label="Default driver"
          hint="Pre-selected when dispatch assigns this company's drops."
          error={errors.defaultDriverId?.message}
        >
          <select
            id="defaultDriverId"
            className={`${selectClassName} max-w-sm`}
            defaultValue={initial.defaultDriverId}
            {...register('defaultDriverId')}
          >
            <option value="">None: drops start unassigned</option>
            {inactiveDriver ? (
              <option value={inactiveDriver.id}>{inactiveDriver.name} (deactivated)</option>
            ) : null}
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </select>
        </Field>
        {inactiveDriver ? (
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {inactiveDriver.name} has been deactivated: this company&apos;s drops will start
            unassigned. Choose another driver.
          </p>
        ) : null}
        <Field
          id="driverInstructions"
          label="Standing instructions for the driver"
          error={errors.driverInstructions?.message}
        >
          <textarea
            id="driverInstructions"
            rows={2}
            defaultValue={initial.driverInstructions}
            className={textareaClassName}
            {...register('driverInstructions')}
          />
        </Field>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting || (company && !isDirty)}>
          {isSubmitting ? 'Saving…' : company ? 'Save company' : 'Create company'}
        </Button>
        {company && isSubmitSuccessful && !isDirty ? (
          <span className="text-sm text-muted-foreground" role="status">
            Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}
