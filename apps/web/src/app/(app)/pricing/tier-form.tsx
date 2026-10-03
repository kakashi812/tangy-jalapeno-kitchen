'use client';

import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  BP_PER_UNIT,
  applyFactorRoundUp5,
  formatCents,
  multiplierToBp,
  percentToBp,
  type PriceRule,
  type TierSummary,
} from '@fernleaf/shared';
import { Field, FormError, selectClassName, textareaClassName } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiSend } from '@/lib/api/client';
import { showServerErrors } from '@/lib/forms';

const RULES: { value: PriceRule; label: string; help: string }[] = [
  {
    value: 'COST_MULTIPLIER',
    label: 'Cost × multiplier',
    help: 'Price = cost × a number, e.g. 2.4.',
  },
  {
    value: 'TIER_PERCENT',
    label: 'Another tier ± %',
    help: 'Price = another tier’s price plus or minus a percentage.',
  },
  {
    value: 'MANUAL',
    label: 'Typed in',
    help: 'Every price entered by hand; anything without a price is not offered.',
  },
];

/** Factors are typed as text ("2.4", "-10") and converted to exact basis points. */
const FormSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name').max(50),
    description: z.string().trim().max(200),
    rule: z.enum(['MANUAL', 'COST_MULTIPLIER', 'TIER_PERCENT']),
    multiplier: z.string(),
    baseTierId: z.string(),
    percent: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.rule === 'COST_MULTIPLIER') {
      const bp = multiplierToBp(v.multiplier);
      if (Number.isNaN(bp) || bp < BP_PER_UNIT || bp > 20 * BP_PER_UNIT) {
        ctx.addIssue({
          code: 'custom',
          path: ['multiplier'],
          message: 'Enter a number from 1 to 20, e.g. 2.4',
        });
      }
    }
    if (v.rule === 'TIER_PERCENT') {
      if (!v.baseTierId)
        ctx.addIssue({ code: 'custom', path: ['baseTierId'], message: 'Choose a tier' });
      const bp = percentToBp(v.percent);
      if (Number.isNaN(bp) || bp < -9_000 || bp > 50_000) {
        ctx.addIssue({
          code: 'custom',
          path: ['percent'],
          message: 'Enter a percentage from -90 to 500, e.g. 15 or -10',
        });
      }
    }
  });
type FormValues = z.infer<typeof FormSchema>;

function toFormValues(tier?: TierSummary): FormValues {
  return {
    name: tier?.name ?? '',
    description: tier?.description ?? '',
    rule: tier?.rule ?? 'COST_MULTIPLIER',
    multiplier: tier?.multiplierBp ? String(tier.multiplierBp / BP_PER_UNIT) : '2.4',
    baseTierId: tier?.baseTierId ?? '',
    percent:
      tier?.percentBp !== null && tier?.percentBp !== undefined ? String(tier.percentBp / 100) : '',
  };
}

export function TierForm({ tier, tiers }: { tier?: TierSummary; tiers: TierSummary[] }) {
  const router = useRouter();
  const initial = toFormValues(tier);
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<FormValues>({ resolver: zodResolver(FormSchema), defaultValues: initial });
  const [rule, multiplier, percent] = useWatch({
    control,
    name: ['rule', 'multiplier', 'percent'],
  });

  // A worked example so the effect of the rule is obvious while typing.
  const exampleCost = 310;
  const multiplierBp = multiplierToBp(multiplier);
  const example =
    rule === 'COST_MULTIPLIER' && !Number.isNaN(multiplierBp)
      ? `A dish costing ${formatCents(exampleCost)} would be ${formatCents(applyFactorRoundUp5(exampleCost, multiplierBp))} (rounded up to the next 5¢).`
      : rule === 'TIER_PERCENT' && !Number.isNaN(percentToBp(percent))
        ? `A dish at ${formatCents(745)} on the base tier would be ${formatCents(applyFactorRoundUp5(745, BP_PER_UNIT + percentToBp(percent)))} here (rounded up to the next 5¢).`
        : null;

  async function onSubmit(values: FormValues) {
    const body = {
      name: values.name,
      description: values.description,
      rule: values.rule,
      multiplierBp: values.rule === 'COST_MULTIPLIER' ? multiplierToBp(values.multiplier) : null,
      baseTierId: values.rule === 'TIER_PERCENT' ? values.baseTierId : null,
      percentBp: values.rule === 'TIER_PERCENT' ? percentToBp(values.percent) : null,
    };
    try {
      const saved = tier
        ? await apiSend<TierSummary>('PUT', `/price-tiers/${tier.id}`, body)
        : await apiSend<TierSummary>('POST', '/price-tiers', body);
      if (tier) {
        reset(toFormValues(saved));
        router.refresh();
      } else {
        router.push(`/pricing/${saved.id}`);
        router.refresh();
      }
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const f = error.fieldErrors;
        if (f.multiplierBp) f.multiplier = f.multiplierBp;
        if (f.percentBp) f.percent = f.percentBp;
      }
      showServerErrors(error, setError);
    }
  }

  const bases = tiers.filter((t) => t.id !== tier?.id);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-5" noValidate>
      <FormError message={errors.root?.server?.message} />
      <Field id="name" label="Tier name" error={errors.name?.message}>
        <Input
          id="name"
          defaultValue={initial.name}
          aria-invalid={!!errors.name}
          {...register('name')}
        />
      </Field>
      <Field id="description" label="Description" error={errors.description?.message}>
        <textarea
          id="description"
          rows={2}
          defaultValue={initial.description}
          className={textareaClassName}
          {...register('description')}
        />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">How prices are set</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {RULES.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer gap-2 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-muted/40"
            >
              <input
                type="radio"
                value={option.value}
                defaultChecked={initial.rule === option.value}
                className="mt-0.5"
                {...register('rule')}
              />
              <span>
                <span className="font-medium">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {rule === 'COST_MULTIPLIER' ? (
        <Field
          id="multiplier"
          label="Multiplier"
          hint="Price = cost × this."
          error={errors.multiplier?.message}
        >
          <Input
            id="multiplier"
            inputMode="decimal"
            className="max-w-32"
            defaultValue={initial.multiplier}
            {...register('multiplier')}
          />
        </Field>
      ) : null}
      {rule === 'TIER_PERCENT' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="baseTierId" label="Based on tier" error={errors.baseTierId?.message}>
            <select
              id="baseTierId"
              className={selectClassName}
              defaultValue={initial.baseTierId}
              {...register('baseTierId')}
            >
              <option value="">Choose a tier…</option>
              {bases.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="percent"
            label="Change (%)"
            hint="e.g. 15 for +15%, -10 for a 10% discount."
            error={errors.percent?.message}
          >
            <Input
              id="percent"
              inputMode="decimal"
              defaultValue={initial.percent}
              {...register('percent')}
            />
          </Field>
        </div>
      ) : null}
      {example ? <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">{example}</p> : null}
      {tier && rule !== 'MANUAL' ? (
        <p className="text-xs text-muted-foreground">
          Prices typed in the grid below are overrides: they win over the rule and are kept as
          typed.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting || (tier && !isDirty)}>
          {isSubmitting ? 'Saving…' : tier ? 'Save tier' : 'Create tier'}
        </Button>
        {tier && isSubmitSuccessful && !isDirty ? (
          <span className="text-sm text-muted-foreground" role="status">
            Saved: new orders use these prices; existing orders keep theirs.
          </span>
        ) : null}
      </div>
    </form>
  );
}
