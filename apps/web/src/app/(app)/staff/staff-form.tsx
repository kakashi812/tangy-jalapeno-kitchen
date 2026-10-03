'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateStaffSchema,
  UpdateStaffSchema,
  type CreateStaffInput,
  type RoleDetail,
  type StaffMember,
  type UpdateStaffInput,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { Field, FormError, selectClassName } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiSend } from '@/lib/api/client';
import { showServerErrors } from '@/lib/forms';

type RoleOption = Pick<RoleDetail, 'id' | 'name'>;

function RoleSelect({
  roles,
  invalid,
  ...props
}: { roles: RoleOption[]; invalid: boolean } & React.ComponentProps<'select'>) {
  return (
    <select className={selectClassName} aria-invalid={invalid} {...props}>
      <option value="">Choose a role…</option>
      {roles.map((role) => (
        <option key={role.id} value={role.id}>
          {role.name}
        </option>
      ))}
    </select>
  );
}

export function CreateStaffForm({ roles }: { roles: RoleOption[] }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof CreateStaffSchema>, unknown, CreateStaffInput>({
    resolver: zodResolver(CreateStaffSchema),
    defaultValues: { email: '', name: '', roleId: '', password: '' },
  });

  async function onSubmit(values: CreateStaffInput) {
    try {
      const created = await apiSend<StaffMember>('POST', '/staff', values);
      router.push(`/staff/${created.id}`);
      router.refresh();
    } catch (error) {
      showServerErrors(error, setError);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-md space-y-4" noValidate>
      <FormError message={errors.root?.server?.message} />
      <Field id="name" label="Name" error={errors.name?.message}>
        <Input id="name" aria-invalid={!!errors.name} {...register('name')} />
      </Field>
      <Field id="email" label="Email" error={errors.email?.message}>
        <Input id="email" type="email" aria-invalid={!!errors.email} {...register('email')} />
      </Field>
      <Field id="roleId" label="Role" error={errors.roleId?.message}>
        <RoleSelect id="roleId" roles={roles} invalid={!!errors.roleId} {...register('roleId')} />
      </Field>
      <Field
        id="password"
        label="Initial password"
        hint="At least 8 characters. Share it with them directly; there are no emails."
        error={errors.password?.message}
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          {...register('password')}
        />
      </Field>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating…' : 'Create staff member'}
      </Button>
    </form>
  );
}

type EditValues = Required<Pick<UpdateStaffInput, 'name' | 'roleId'>>;

export function EditStaffForm({
  member,
  roles,
  isSelf,
}: {
  member: StaffMember;
  roles: RoleOption[];
  isSelf: boolean;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<EditValues>({
    resolver: zodResolver(UpdateStaffSchema.required({ name: true, roleId: true })),
    defaultValues: { name: member.name, roleId: member.role.id },
  });

  async function onSubmit(values: EditValues) {
    try {
      const saved = await apiSend<StaffMember>('PATCH', `/staff/${member.id}`, values);
      reset({ name: saved.name, roleId: saved.role.id });
      router.refresh();
    } catch (error) {
      showServerErrors(error, setError);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-md space-y-4" noValidate>
      <FormError message={errors.root?.server?.message} />
      <Field id="name" label="Name" error={errors.name?.message}>
        <Input
          id="name"
          defaultValue={member.name}
          aria-invalid={!!errors.name}
          {...register('name')}
        />
      </Field>
      <Field
        id="roleId"
        label="Role"
        hint={isSelf ? "You can't change your own role." : undefined}
        error={errors.roleId?.message}
      >
        <RoleSelect
          id="roleId"
          roles={roles}
          invalid={!!errors.roleId}
          disabled={isSelf}
          defaultValue={member.role.id}
          {...register('roleId')}
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? 'Saving…' : 'Save changes'}
        </Button>
        {isSubmitSuccessful && !isDirty ? (
          <span className="text-sm text-muted-foreground" role="status">
            Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}
