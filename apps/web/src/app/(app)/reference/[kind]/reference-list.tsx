'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ReferenceItemInputSchema,
  type ReferenceItem,
  type ReferenceItemInput,
  type ReferenceKind,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { FormError } from '@/components/form/field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiSend } from '@/lib/api/client';
import { showServerErrors } from '@/lib/forms';

type ItemValues = z.output<typeof ReferenceItemInputSchema>;

/** One editable row: name, order, active. Saves only what changed. */
function ItemRow({ kind, item }: { kind: ReferenceKind; item: ReferenceItem }) {
  const router = useRouter();
  const [deleteError, setDeleteError] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors, isSubmitting, isDirty, dirtyFields },
  } = useForm<ReferenceItemInput, unknown, ItemValues>({
    resolver: zodResolver(ReferenceItemInputSchema),
    defaultValues: { name: item.name, sortOrder: item.sortOrder, isActive: item.isActive },
  });

  async function onSubmit(values: ItemValues) {
    const changes = Object.fromEntries(
      Object.entries(values).filter(([key]) => dirtyFields[key as keyof ItemValues]),
    );
    try {
      const saved = await apiSend<ReferenceItem>('PATCH', `/reference/${kind}/${item.id}`, changes);
      reset({ name: saved.name, sortOrder: saved.sortOrder, isActive: saved.isActive });
      router.refresh();
    } catch (error) {
      showServerErrors(error, setError);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    setDeleteError(undefined);
    try {
      await apiSend('DELETE', `/reference/${kind}/${item.id}`);
      router.refresh();
    } catch (error) {
      setDeleteError(
        error instanceof ApiRequestError ? error.message : 'Could not reach the server.',
      );
    }
  }

  const error =
    errors.name?.message ??
    errors.sortOrder?.message ??
    errors.root?.server?.message ??
    deleteError;

  return (
    <li className="space-y-1 px-4 py-2">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-wrap items-center gap-3"
        noValidate
      >
        <Input
          aria-label="Name"
          className="w-56"
          aria-invalid={!!errors.name}
          defaultValue={item.name}
          {...register('name')}
        />
        <Input
          aria-label="Order"
          type="number"
          className="w-20"
          min={0}
          max={999}
          aria-invalid={!!errors.sortOrder}
          defaultValue={item.sortOrder}
          {...register('sortOrder', { valueAsNumber: true })}
        />
        <label className="flex items-center gap-2 text-sm">
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
            )}
          />
          Active
        </label>
        {!item.isActive ? <Badge variant="outline">Hidden from pickers</Badge> : null}
        <div className="ml-auto flex gap-2">
          <Button type="submit" size="sm" disabled={!isDirty || isSubmitting}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={remove}>
            Delete
          </Button>
        </div>
      </form>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function AddItemForm({ kind, singular }: { kind: ReferenceKind; singular: string }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ReferenceItemInput, unknown, ItemValues>({
    resolver: zodResolver(ReferenceItemInputSchema),
    defaultValues: { name: '', sortOrder: 0, isActive: true },
  });

  async function onSubmit(values: ItemValues) {
    try {
      await apiSend('POST', `/reference/${kind}`, values);
      reset();
      router.refresh();
    } catch (error) {
      showServerErrors(error, setError);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-2" noValidate>
      <FormError message={errors.root?.server?.message} />
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label={`New ${singular}`}
          placeholder={`New ${singular}`}
          className="w-56"
          aria-invalid={!!errors.name}
          {...register('name')}
        />
        <Input
          aria-label="Order"
          type="number"
          className="w-20"
          min={0}
          max={999}
          {...register('sortOrder', { valueAsNumber: true })}
        />
        <Button type="submit" variant="outline" disabled={isSubmitting}>
          Add
        </Button>
      </div>
      {errors.name?.message ? (
        <p className="text-sm text-destructive" role="alert">
          {errors.name.message}
        </p>
      ) : null}
    </form>
  );
}

export function ReferenceList({
  kind,
  singular,
  items,
}: {
  kind: ReferenceKind;
  singular: string;
  items: ReferenceItem[];
}) {
  return (
    <div className="max-w-3xl space-y-4">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        <div className="rounded-lg border">
          <div className="flex gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
            <span className="w-56">Name</span>
            <span className="w-20" title="Lower numbers come first in lists and pickers">
              Order
            </span>
            <span>Active</span>
          </div>
          <ul className="divide-y">
            {items.map((item) => (
              // The key includes the saved values, so a row resets when the server data changes.
              <ItemRow
                key={`${item.id}:${item.name}:${item.sortOrder}:${item.isActive}`}
                kind={kind}
                item={item}
              />
            ))}
          </ul>
        </div>
      )}
      <AddItemForm kind={kind} singular={singular} />
    </div>
  );
}
