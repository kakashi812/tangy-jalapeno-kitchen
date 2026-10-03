'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  PERMISSIONS,
  RoleInputSchema,
  type Permission,
  type RoleDetail,
  type RoleInput,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { Field, FormError } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiSend } from '@/lib/api/client';
import { showServerErrors } from '@/lib/forms';

type RoleValues = z.output<typeof RoleInputSchema>;

/** Permissions grouped by area (Staff, Orders, Kitchen…), in the order they are declared. */
const GROUPS = Object.entries(PERMISSIONS).reduce<
  { group: string; items: { key: Permission; label: string }[] }[]
>((groups, [key, { group, label }]) => {
  const existing = groups.find((g) => g.group === group);
  const item = { key: key as Permission, label };
  if (existing) existing.items.push(item);
  else groups.push({ group, items: [item] });
  return groups;
}, []);

/** Read-only list of what a role can do (used for the locked Admin role). */
export function PermissionSummary({ permissions }: { permissions: Permission[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {GROUPS.map(({ group, items }) => (
        <div key={group} className="space-y-1">
          <h3 className="text-sm font-medium">{group}</h3>
          <ul className="space-y-0.5 text-sm text-muted-foreground">
            {items.map((item) => (
              <li key={item.key}>
                {permissions.includes(item.key) ? '✓' : '–'} {item.label}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function RoleForm({ role }: { role?: RoleDetail }) {
  const router = useRouter();
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<z.input<typeof RoleInputSchema>, unknown, RoleValues>({
    resolver: zodResolver(RoleInputSchema),
    defaultValues: {
      name: role?.name ?? '',
      description: role?.description ?? '',
      permissions: role?.permissions ?? [],
    },
  });

  async function onSubmit(values: RoleInput) {
    try {
      if (role) {
        const saved = await apiSend<RoleDetail>('PUT', `/roles/${role.id}`, values);
        reset({ name: saved.name, description: saved.description, permissions: saved.permissions });
        router.refresh();
      } else {
        const created = await apiSend<RoleDetail>('POST', '/roles', values);
        router.push(`/roles/${created.id}`);
        router.refresh();
      }
    } catch (error) {
      showServerErrors(error, setError);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-6" noValidate>
      <FormError message={errors.root?.server?.message} />
      <div className="grid max-w-md gap-4">
        <Field id="name" label="Role name" error={errors.name?.message}>
          <Input id="name" aria-invalid={!!errors.name} {...register('name')} />
        </Field>
        <Field id="description" label="Description" error={errors.description?.message}>
          <Input
            id="description"
            aria-invalid={!!errors.description}
            {...register('description')}
          />
        </Field>
      </div>

      <fieldset className="space-y-3">
        <legend className="font-medium">Permissions</legend>
        <p className="text-sm text-muted-foreground">
          What staff with this role may do. The server checks these on every request.
        </p>
        {errors.permissions?.message ? (
          <p className="text-sm text-destructive" role="alert">
            {errors.permissions.message}
          </p>
        ) : null}
        <Controller
          control={control}
          name="permissions"
          render={({ field }) => (
            <div className="grid gap-5 sm:grid-cols-2">
              {GROUPS.map(({ group, items }) => (
                <div key={group} className="space-y-2">
                  <h3 className="text-sm font-medium">{group}</h3>
                  {items.map((item) => {
                    const checked = field.value.includes(item.key);
                    return (
                      <label key={item.key} className="flex items-start gap-2 text-sm">
                        <Checkbox
                          className="mt-0.5"
                          checked={checked}
                          onCheckedChange={(next) =>
                            field.onChange(
                              next
                                ? [...field.value, item.key]
                                : field.value.filter((p) => p !== item.key),
                            )
                          }
                        />
                        <span>
                          {item.label}
                          <span className="block text-xs text-muted-foreground">{item.key}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        />
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting || (role && !isDirty)}>
          {isSubmitting ? 'Saving…' : role ? 'Save changes' : 'Create role'}
        </Button>
        {role && isSubmitSuccessful && !isDirty ? (
          <span className="text-sm text-muted-foreground" role="status">
            Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}

export function DeleteRoleButton({ role }: { role: RoleDetail }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function remove() {
    if (!window.confirm(`Delete the ${role.name} role?`)) return;
    setPending(true);
    setError(undefined);
    try {
      await apiSend('DELETE', `/roles/${role.id}`);
      router.push('/roles');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not reach the server.');
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <FormError message={error} />
      <Button variant="destructive" onClick={remove} disabled={pending || role.staffCount > 0}>
        Delete role
      </Button>
      {role.staffCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          Only roles nobody has can be deleted. Move its {role.staffCount} staff member
          {role.staffCount === 1 ? '' : 's'} to another role first.
        </p>
      ) : null}
    </div>
  );
}
