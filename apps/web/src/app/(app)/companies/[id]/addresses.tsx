'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AddressInputSchema, type AddressInput, type CompanyAddress } from '@fernleaf/shared';
import type { z } from 'zod';
import { Field, FormError } from '@/components/form/field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiSend } from '@/lib/api/client';
import { showServerErrors } from '@/lib/forms';

type AddressValues = z.output<typeof AddressInputSchema>;

function AddressForm({
  companyId,
  address,
  onDone,
}: {
  companyId: string;
  address?: CompanyAddress;
  onDone: () => void;
}) {
  const router = useRouter();
  const initial: AddressInput = address ?? {
    label: '',
    line1: '',
    line2: '',
    city: 'Bengaluru',
    postcode: '',
    deliveryNotes: '',
    isDefault: false,
  };
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AddressInput, unknown, AddressValues>({
    resolver: zodResolver(AddressInputSchema),
    defaultValues: initial,
  });

  async function onSubmit(values: AddressValues) {
    try {
      await (address
        ? apiSend('PUT', `/companies/${companyId}/addresses/${address.id}`, values)
        : apiSend('POST', `/companies/${companyId}/addresses`, values));
      onDone();
      router.refresh();
    } catch (error) {
      showServerErrors(error, setError);
    }
  }

  const id = (name: string) => `${address?.id ?? 'new'}-${name}`;
  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-3 rounded-lg border bg-muted/20 p-4"
      noValidate
    >
      <FormError message={errors.root?.server?.message ?? errors.isDefault?.message} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={id('label')} label="Label" error={errors.label?.message}>
          <Input
            id={id('label')}
            placeholder="e.g. HQ reception"
            defaultValue={initial.label}
            {...register('label')}
          />
        </Field>
        <Field id={id('line1')} label="Address line 1" error={errors.line1?.message}>
          <Input id={id('line1')} defaultValue={initial.line1} {...register('line1')} />
        </Field>
        <Field id={id('line2')} label="Address line 2" error={errors.line2?.message}>
          <Input id={id('line2')} defaultValue={initial.line2} {...register('line2')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id={id('city')} label="City" error={errors.city?.message}>
            <Input id={id('city')} defaultValue={initial.city} {...register('city')} />
          </Field>
          <Field id={id('postcode')} label="Postcode" error={errors.postcode?.message}>
            <Input id={id('postcode')} defaultValue={initial.postcode} {...register('postcode')} />
          </Field>
        </div>
      </div>
      <Field id={id('notes')} label="Delivery notes" error={errors.deliveryNotes?.message}>
        <Input
          id={id('notes')}
          placeholder="e.g. Loading bay at the back"
          defaultValue={initial.deliveryNotes}
          {...register('deliveryNotes')}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" defaultChecked={initial.isDefault} {...register('isDefault')} />
        Default delivery address
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : address ? 'Save address' : 'Add address'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function Addresses({
  companyId,
  addresses,
  canEdit,
}: {
  companyId: string;
  addresses: CompanyAddress[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [error, setError] = useState<string>();

  async function remove(address: CompanyAddress) {
    if (!window.confirm(`Delete "${address.label}"?`)) return;
    setError(undefined);
    try {
      await apiSend('DELETE', `/companies/${companyId}/addresses/${address.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not reach the server.');
    }
  }

  return (
    <div className="max-w-3xl space-y-3">
      <FormError message={error} />
      {addresses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No delivery addresses yet.</p>
      ) : null}
      <ul className="space-y-2">
        {addresses.map((address) =>
          editing === address.id ? (
            <li key={address.id}>
              <AddressForm
                companyId={companyId}
                address={address}
                onDone={() => setEditing(null)}
              />
            </li>
          ) : (
            <li
              key={address.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3"
            >
              <div className="text-sm">
                <div className="flex items-center gap-2 font-medium">
                  {address.label}
                  {address.isDefault ? <Badge variant="secondary">Default</Badge> : null}
                </div>
                <div className="text-muted-foreground">
                  {[address.line1, address.line2, `${address.city} ${address.postcode}`]
                    .filter(Boolean)
                    .join(', ')}
                </div>
                {address.deliveryNotes ? (
                  <div className="text-xs text-muted-foreground">Note: {address.deliveryNotes}</div>
                ) : null}
              </div>
              {canEdit ? (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(address.id)}>
                    Edit
                  </Button>
                  {!address.isDefault ? (
                    <Button size="sm" variant="ghost" onClick={() => remove(address)}>
                      Delete
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ),
        )}
      </ul>
      {canEdit ? (
        editing === 'new' ? (
          <AddressForm companyId={companyId} onDone={() => setEditing(null)} />
        ) : (
          <Button variant="outline" onClick={() => setEditing('new')}>
            Add address
          </Button>
        )
      ) : null}
    </div>
  );
}
