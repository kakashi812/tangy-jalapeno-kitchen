'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  OrderOverrideSchema,
  formatTimeOfDay,
  type OrderDetail,
  type OverrideChoices,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { Field, FormError, selectClassName } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiSend } from '@/lib/api/client';
import { showServerErrors } from '@/lib/forms';

export function OrderActions({ order }: { order: OrderDetail }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function act(action: 'place' | 'cancel' | 'reject') {
    if (
      action !== 'place' &&
      !window.confirm(`${action === 'cancel' ? 'Cancel' : 'Reject'} ${order.number}?`)
    )
      return;
    setError('');
    setBusy(true);
    try {
      await apiSend('POST', `/orders/${order.id}/${action}`, { version: order.version, reason });
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update order');
    } finally {
      setBusy(false);
    }
  }
  if (!order.permissions.place && !order.permissions.cancel && !order.permissions.reject)
    return null;
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h2 className="font-heading text-lg font-bold">Order actions</h2>
      {(order.permissions.cancel || order.permissions.reject) && (
        <Field
          id="action-reason"
          label="Reason"
          hint="Required for rejection; optional for cancellation."
        >
          <Input
            id="action-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        {order.permissions.place && (
          <Button disabled={busy} onClick={() => act('place')}>
            Place saved draft
          </Button>
        )}
        {order.permissions.cancel && (
          <Button variant="outline" disabled={busy} onClick={() => act('cancel')}>
            Cancel order
          </Button>
        )}
        {order.permissions.reject && (
          <Button
            variant="destructive"
            disabled={busy || !reason.trim()}
            onClick={() => act('reject')}
          >
            Reject order
          </Button>
        )}
      </div>
      <FormError message={error} />
    </section>
  );
}

export function OverrideForm({ order, choices }: { order: OrderDetail; choices: OverrideChoices }) {
  const router = useRouter();
  type Values = z.infer<typeof OrderOverrideSchema>;
  const initial: Values = {
    version: order.version,
    addressId: order.addressId,
    deliveryTimeMinutes: order.deliveryTimeMinutes,
    packagingTypeId: order.packagingTypeId,
    reason: '',
  };
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(OrderOverrideSchema), defaultValues: initial });
  async function submit(values: Values) {
    try {
      await apiSend('PUT', `/orders/${order.id}/override`, values);
      router.refresh();
    } catch (error) {
      showServerErrors(error, setError);
    }
  }
  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4 rounded-lg border p-4">
      <h2 className="font-heading text-lg font-bold">Admin delivery override</h2>
      <p className="text-sm text-muted-foreground">
        Change delivery details after confirmation, until out for delivery. Employee restrictions
        are bypassed; the company address and platform time window still apply.
      </p>
      <FormError message={errors.root?.server?.message} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="override-address" label="Address" error={errors.addressId?.message}>
          <select
            id="override-address"
            className={selectClassName}
            {...register('addressId')}
            defaultValue={initial.addressId}
          >
            {choices.addresses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="override-time"
          label="Delivery time (IST)"
          error={errors.deliveryTimeMinutes?.message}
        >
          <select
            id="override-time"
            className={selectClassName}
            {...register('deliveryTimeMinutes', { valueAsNumber: true })}
            defaultValue={initial.deliveryTimeMinutes}
          >
            {Array.from({ length: 96 }, (_, i) => i * 15).map((m) => (
              <option key={m} value={m}>
                {formatTimeOfDay(m)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="override-packaging" label="Packaging" error={errors.packagingTypeId?.message}>
          <select
            id="override-packaging"
            className={selectClassName}
            {...register('packagingTypeId')}
            defaultValue={initial.packagingTypeId}
          >
            {choices.packagingTypes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="override-reason" label="Override reason" error={errors.reason?.message}>
        <Input id="override-reason" {...register('reason')} defaultValue="" maxLength={500} />
      </Field>
      <Button type="submit" variant="outline" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : 'Apply override'}
      </Button>
    </form>
  );
}
