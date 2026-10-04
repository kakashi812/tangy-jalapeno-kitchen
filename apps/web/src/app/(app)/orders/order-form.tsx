'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import {
  OrderInputSchema,
  formatCents,
  formatKitchenDateTime,
  formatTimeOfDay,
  mergeCombinations,
  sameLine,
  snapshotLine,
  validateSnapshot,
  OrderRuleError,
  type MenuDish,
  type OrderContext,
  type OrderDetail,
  type OrderInput,
  type OrderLine,
} from '@fernleaf/shared';
import { Field, FormError, selectClassName, textareaClassName } from '@/components/form/field';
import { MenuDishCard, groupRule } from '@/components/menu/menu-dish-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiRequestError, toApiRequestError } from '@/lib/api/api-error';
import { apiSend } from '@/lib/api/client';
import { showServerErrors } from '@/lib/forms';

type Values = z.input<typeof OrderInputSchema>;
/** Only the money-authorized edit page passes saved lines to this form. */
export type EditableOrder = Omit<OrderDetail, 'lines'> & { lines: OrderLine[] };
const newLine = (dish: MenuDish, quantity = 1) => ({
  menuItemId: dish.menuItemId,
  quantity,
  combinations: [{ quantity, optionIds: [] as string[] }],
});

export function OrderForm({
  context: initialContext,
  order,
  admin,
}: {
  context: OrderContext;
  order?: EditableOrder;
  admin: boolean;
}) {
  const router = useRouter();
  const [context, setContext] = useState(initialContext);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [existingId, setExistingId] = useState<string>();
  const defaults: OrderInput = {
    employeeId: order?.employee.id ?? context.menu.employee.id,
    deliveryDate: order?.deliveryDate ?? context.deliveryDate,
    addressId: order?.addressId ?? context.defaults.addressId,
    deliveryTimeMinutes: order?.deliveryTimeMinutes ?? context.defaults.deliveryTimeMinutes,
    packagingTypeId: order?.packagingTypeId ?? context.defaults.packagingTypeId,
    notes: order?.notes ?? '',
    lines:
      order?.lines.map((l) => ({
        id: l.id,
        menuItemId: l.menuItemId,
        quantity: l.quantity,
        combinations: l.combinations.map((c) => ({
          quantity: c.quantity,
          optionIds: c.options.map((o) => o.id),
        })),
      })) ?? [],
    secretCodes: [],
    intent: order?.status === 'DRAFT' ? 'draft' : 'place',
    version: order?.version,
  };
  const form = useForm<Values, unknown, OrderInput>({
    resolver: zodResolver(OrderInputSchema),
    defaultValues: defaults,
  });
  const {
    register,
    control,
    setValue,
    getValues,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = form;
  const { fields, append, remove, update } = useFieldArray({
    control,
    name: 'lines',
    keyName: 'formKey',
  });
  const lines = useWatch({ control, name: 'lines' }) ?? [];
  const date = useWatch({ control, name: 'deliveryDate' });
  const dishes = context.menu.categories.flatMap((c) => c.dishes);
  const chosen = new Set(lines.map((l) => l.menuItemId));
  const frozenChoices = !admin && context.closed;
  const deliveryOverride = admin;
  const previews = lines.map((line, index) => {
    const saved = order?.lines.find((l) => l.id === line.id);
    if (saved && sameLine(line, saved)) return { cents: saved.totalCents, error: '' };
    const dish = dishes.find((d) => d.menuItemId === line.menuItemId);
    if (!dish)
      return {
        cents: undefined,
        error: 'This dish is unavailable. Keep its saved line or remove it.',
      };
    try {
      return { cents: snapshotLine(line, dish, index, false).totalCents, error: '' };
    } catch (error) {
      return {
        cents: undefined,
        error:
          error instanceof OrderRuleError
            ? Object.values(error.fieldErrors).flat().join(' ')
            : 'Complete this line to calculate its price.',
      };
    }
  });
  const total = previews.every((p) => p.cents !== undefined)
    ? previews.reduce((sum, p) => sum + (p.cents ?? 0), 0)
    : undefined;

  async function unlock() {
    setCodeError('');
    setUnlocking(true);
    const codes = [...new Set([...(getValues('secretCodes') ?? []), code.trim().toUpperCase()])];
    try {
      const response = await fetch(
        `/api/orders/context?${new URLSearchParams({ employeeId: defaults.employeeId, deliveryDate: getValues('deliveryDate'), codes: codes.join(',') })}`,
      );
      if (!response.ok) throw await toApiRequestError(response);
      const next = (await response.json()) as OrderContext;
      setContext(next);
      setValue('secretCodes', codes);
      setCode('');
    } catch (error) {
      setCodeError(error instanceof Error ? error.message : 'Could not load secret items');
    } finally {
      setUnlocking(false);
    }
  }

  async function submit(values: OrderInput) {
    setExistingId(undefined);
    const payload = {
      ...values,
      lines: values.lines.map((l) => ({ ...l, combinations: mergeCombinations(l.combinations) })),
    };
    // The API repeats all validation; this pass makes line errors immediate and actionable.
    try {
      for (const [index, line] of payload.lines.entries()) {
        const saved = order?.lines.find((l) => l.id === line.id);
        if (saved && sameLine(line, saved))
          validateSnapshot(saved, index, values.intent === 'place');
        else {
          const dish = dishes.find((d) => d.menuItemId === line.menuItemId);
          if (dish) snapshotLine(line, dish, index, values.intent === 'place');
        }
      }
      const result = await apiSend<{ id: string }>(
        order ? 'PUT' : 'POST',
        order ? `/orders/${order.id}` : '/orders',
        payload,
      );
      router.push(`/orders/${result.id}`);
      router.refresh();
    } catch (error) {
      if (error instanceof OrderRuleError) {
        for (const [field, messages] of Object.entries(error.fieldErrors))
          setError(field as Parameters<typeof setError>[0], { message: messages.join(' ') });
      } else if (error instanceof ApiRequestError && error.code === 'ORDER_EXISTS') {
        setExistingId(error.fieldErrors.existingOrderId?.[0]);
        setError('root.server', { message: error.message });
      } else showServerErrors(error, setError);
    }
  }
  function send(intent: 'draft' | 'place') {
    clearErrors();
    setValue('intent', intent);
    void handleSubmit(submit)();
  }
  const errorMessages = Object.entries(errors)
    .filter(([key]) => key !== 'root')
    .flatMap(([key, value]) => {
      const gather = (v: unknown): string[] =>
        typeof v === 'object' && v !== null
          ? 'message' in v && typeof v.message === 'string'
            ? [v.message]
            : Object.entries(v)
                .filter(([k]) => k !== 'ref')
                .flatMap(([, child]) => gather(child))
          : [];
      return gather(value).map((message) => `${key}: ${message}`);
    });

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-6">
      <section className="space-y-2 rounded-lg border bg-muted/30 p-4">
        <h2 className="font-heading text-xl font-bold">
          {order?.employee.name ?? context.menu.employee.name}
        </h2>
        <p className="text-sm text-muted-foreground">
          {order?.company.name ?? context.menu.company.name} · {context.menu.tier.name} prices
        </p>
        {date === initialContext.deliveryDate ? (
          <p className="text-sm">
            Cutoff: {formatKitchenDateTime(new Date(initialContext.cutoffAt))} IST{' '}
            {initialContext.closed ? '· Closed' : ''}
          </p>
        ) : (
          <p className="text-sm">
            Delivery date changed: the API will recalculate the cutoff when saving.
          </p>
        )}
        {context.menu.employee.allergies.length > 0 && (
          <p className="text-sm text-destructive">
            Allergies: {context.menu.employee.allergies.map((a) => a.name).join(', ')}. Choices
            warn; they are not blocked.
          </p>
        )}
        {context.menu.employee.dietaryPreferences.length > 0 && (
          <p className="text-sm">
            Dietary preferences:{' '}
            {context.menu.employee.dietaryPreferences.map((d) => d.name).join(', ')}
          </p>
        )}
        {initialContext.closed && (
          <p className="text-sm text-amber-700">
            {admin
              ? 'Admin placement on a closed date confirms the order immediately. Drafts cannot be saved for a closed date.'
              : 'Orders for this date are closed.'}
          </p>
        )}
      </section>
      <FormError message={errors.root?.server?.message} />
      {existingId && (
        <Link href={`/orders/${existingId}`} className="text-sm text-primary underline">
          Open the existing order →
        </Link>
      )}
      {errorMessages.length > 0 && (
        <div
          role="alert"
          className="space-y-1 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
        >
          {[...new Set(errorMessages)].map((m) => (
            <p key={m}>{m}</p>
          ))}
        </div>
      )}
      <section className="grid gap-4 rounded-lg border p-4 md:grid-cols-3">
        <Field id="deliveryDate" label="Delivery date">
          <Input
            id="deliveryDate"
            type="date"
            {...register('deliveryDate')}
            defaultValue={defaults.deliveryDate}
            disabled={order?.status === 'CONFIRMED'}
          />
        </Field>
        <Field
          id="addressId"
          label="Delivery address"
          hint={
            !context.flags.canChooseAddress && !deliveryOverride
              ? 'Company default; employee cannot choose another address.'
              : undefined
          }
        >
          <select
            id="addressId"
            className={selectClassName}
            {...register('addressId')}
            defaultValue={defaults.addressId}
            disabled={!context.flags.canChooseAddress && !deliveryOverride}
          >
            {context.addresses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
                {a.isDefault ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field id="deliveryTimeMinutes" label="Delivery time (IST)">
          <select
            id="deliveryTimeMinutes"
            className={selectClassName}
            {...register('deliveryTimeMinutes', { valueAsNumber: true })}
            defaultValue={defaults.deliveryTimeMinutes}
            disabled={!context.flags.canChangeDeliveryTime && !deliveryOverride}
          >
            {[
              ...new Set([
                defaults.deliveryTimeMinutes,
                ...Array.from(
                  {
                    length:
                      Math.floor(
                        (context.deliveryWindowEndMinutes - context.deliveryWindowStartMinutes) /
                          15,
                      ) + 1,
                  },
                  (_, i) => context.deliveryWindowStartMinutes + i * 15,
                ),
              ]),
            ]
              .sort((a, b) => a - b)
              .map((m) => (
                <option key={m} value={m}>
                  {formatTimeOfDay(m)}
                </option>
              ))}
          </select>
        </Field>
        <Field id="packagingTypeId" label="Packaging">
          <select
            id="packagingTypeId"
            className={selectClassName}
            {...register('packagingTypeId')}
            defaultValue={defaults.packagingTypeId}
            disabled={!context.flags.canChangePackaging && !deliveryOverride}
          >
            {order && !context.packagingTypes.some((p) => p.id === order.packagingTypeId) && (
              <option value={order.packagingTypeId}>{order.packagingName} (saved)</option>
            )}
            {context.packagingTypes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field id="notes" label="Order notes">
            <textarea
              id="notes"
              {...register('notes')}
              defaultValue={defaults.notes}
              className={textareaClassName}
              maxLength={500}
            />
          </Field>
        </div>
      </section>
      <section className="space-y-4">
        <h2 className="font-heading text-xl font-bold">Order lines</h2>
        {!fields.length && (
          <p className="text-sm text-muted-foreground">
            Add dishes from the menu below. Empty drafts are allowed.
          </p>
        )}
        {fields.map((field, index) => {
          const line = lines[index];
          if (!line) return null;
          const saved = order?.lines.find((l) => l.id === line.id);
          const dish = dishes.find((d) => d.menuItemId === line.menuItemId);
          return (
            <article key={field.formKey} className="space-y-4 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">{saved?.name ?? dish?.name ?? 'Unavailable dish'}</h3>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums">
                    {previews[index]?.cents === undefined
                      ? 'Incomplete'
                      : formatCents(previews[index]!.cents!)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => remove(index)}
                    disabled={isSubmitting}
                  >
                    Remove line
                  </Button>
                </div>
              </div>
              {saved ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Saved line: {saved.quantity} meals at original prices. Keeping it unchanged
                    preserves its snapshot.
                  </p>
                  <ul className="space-y-1 text-sm">
                    {saved.combinations.map((c, i) => (
                      <li key={i}>
                        {c.quantity} × {c.options.map((o) => o.name).join(' + ') || 'No options'} ·{' '}
                        {formatCents(c.unitPriceCents)} each
                      </li>
                    ))}
                  </ul>
                  {dish ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => update(index, newLine(dish, saved.quantity))}
                    >
                      Change line using current menu and prices
                    </Button>
                  ) : (
                    <p className="text-sm text-amber-700">
                      No longer available on the current menu. This saved line can stay unchanged or
                      be removed.
                    </p>
                  )}
                </>
              ) : dish ? (
                <>
                  <Field id={`line-${index}-quantity`} label="Line quantity">
                    <Input
                      id={`line-${index}-quantity`}
                      type="number"
                      min={1}
                      max={500}
                      className="max-w-32"
                      {...register(`lines.${index}.quantity`, { valueAsNumber: true })}
                      defaultValue={line.quantity}
                    />
                  </Field>
                  {line.combinations.map((combination, ci) => (
                    <fieldset key={ci} className="space-y-3 rounded-lg bg-muted/30 p-3">
                      <legend className="px-1 text-sm font-medium">Combination {ci + 1}</legend>
                      <div className="flex items-center gap-2">
                        <label htmlFor={`combo-${index}-${ci}`} className="text-sm">
                          Quantity
                        </label>
                        <Input
                          id={`combo-${index}-${ci}`}
                          type="number"
                          min={1}
                          max={500}
                          className="w-24"
                          {...register(`lines.${index}.combinations.${ci}.quantity`, {
                            valueAsNumber: true,
                          })}
                          defaultValue={combination.quantity}
                        />
                        {line.combinations.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              setValue(
                                `lines.${index}.combinations`,
                                line.combinations.filter((_, i) => i !== ci),
                              )
                            }
                          >
                            Remove combination
                          </Button>
                        )}
                      </div>
                      {dish.groups.map((group) => (
                        <div key={group.id} className="space-y-1">
                          <p className="text-sm font-medium">
                            {group.name}{' '}
                            <span className="font-normal text-muted-foreground">
                              ({groupRule(group.minSelect, group.maxSelect)})
                            </span>
                          </p>
                          <div className="flex flex-wrap gap-x-5 gap-y-2">
                            {group.options.map((option) => (
                              <label
                                key={option.id}
                                className={`flex items-center gap-2 text-sm ${option.allergyConflicts.length ? 'text-destructive' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={combination.optionIds.includes(option.id)}
                                  onChange={(e) =>
                                    setValue(
                                      `lines.${index}.combinations.${ci}.optionIds`,
                                      e.target.checked
                                        ? [...combination.optionIds, option.id]
                                        : combination.optionIds.filter((id) => id !== option.id),
                                      { shouldDirty: true },
                                    )
                                  }
                                />
                                {option.name} (+{formatCents(option.priceCents)})
                                {option.allergyConflicts.length ? ' · allergy warning' : ''}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                      {!dish.groups.length && (
                        <p className="text-sm text-muted-foreground">
                          No option groups; one combination.
                        </p>
                      )}
                    </fieldset>
                  ))}
                  {dish.groups.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setValue(`lines.${index}.combinations`, [
                          ...line.combinations,
                          { quantity: 1, optionIds: [] },
                        ])
                      }
                    >
                      Add combination
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Combination quantities must sum to {line.quantity}. Identical combinations merge
                    when saving. Required choices and minimum quantities are enforced when placing.
                  </p>
                  <FormError message={previews[index]?.error} />
                </>
              ) : (
                <FormError message="Dish unavailable" />
              )}
            </article>
          );
        })}
      </section>
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-heading text-lg font-bold">Secret items</h2>
        <p className="text-sm text-muted-foreground">
          Enter a category access code to reveal its dishes for this employee.
        </p>
        <div className="flex gap-2">
          <Input
            aria-label="Secret category code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={20}
            className="max-w-64"
          />
          <Button
            type="button"
            variant="outline"
            disabled={unlocking || !code.trim()}
            onClick={unlock}
          >
            {unlocking ? 'Loading…' : 'Show secret items'}
          </Button>
        </div>
        <FormError message={codeError} />
      </section>
      {context.menu.categories.map((category) => (
        <section key={category.id} className="space-y-3">
          <h2 className="font-heading text-xl font-bold">
            {category.name}
            {category.isSecret ? ' · Secret' : ''}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {category.dishes.map((dish) => (
              <li key={dish.menuItemId} className="flex">
                <MenuDishCard
                  dish={dish}
                  employeeName={context.menu.employee.name}
                  footer={
                    <Button
                      type="button"
                      className="w-full"
                      variant="outline"
                      disabled={chosen.has(dish.menuItemId) || isSubmitting}
                      onClick={() => append(newLine(dish))}
                    >
                      {chosen.has(dish.menuItemId) ? 'Added to order' : 'Add dish'}
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/95 p-4 backdrop-blur">
        <p className="font-medium">
          Total:{' '}
          {total === undefined ? 'Complete line quantities to calculate' : formatCents(total)}{' '}
          <span className="text-xs text-muted-foreground">pre-tax · server verifies prices</span>
        </p>
        <div className="flex gap-2">
          {(!order || order.status === 'DRAFT') && (
            <Button
              type="button"
              variant="outline"
              disabled={
                isSubmitting ||
                frozenChoices ||
                (initialContext.closed && date === initialContext.deliveryDate)
              }
              onClick={() => send('draft')}
            >
              Save draft
            </Button>
          )}
          <Button
            type="button"
            disabled={isSubmitting || frozenChoices}
            onClick={() => send('place')}
          >
            {isSubmitting
              ? 'Saving…'
              : order?.status === 'CONFIRMED' || order?.status === 'PLACED'
                ? 'Save changes'
                : 'Place order'}
          </Button>
        </div>
      </div>
    </form>
  );
}
