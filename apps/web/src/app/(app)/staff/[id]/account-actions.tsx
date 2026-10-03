'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ResetPasswordSchema, type ResetPasswordInput, type StaffMember } from '@fernleaf/shared';
import { Field, FormError } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiSend } from '@/lib/api/client';
import { showServerErrors } from '@/lib/forms';

/** Deactivate / reactivate. Staff are never deleted, so history keeps pointing at them. */
export function ActivationToggle({ member, isSelf }: { member: StaffMember; isSelf: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function toggle() {
    const deactivating = member.isActive;
    if (
      deactivating &&
      !window.confirm(`Deactivate ${member.name}? They will be signed out and unable to sign in.`)
    ) {
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await apiSend('PATCH', `/staff/${member.id}`, { isActive: !member.isActive });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not reach the server.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <FormError message={error} />
      <Button
        variant={member.isActive ? 'destructive' : 'outline'}
        onClick={toggle}
        disabled={pending || isSelf}
      >
        {member.isActive ? 'Deactivate account' : 'Reactivate account'}
      </Button>
      {isSelf ? (
        <p className="text-xs text-muted-foreground">You can&apos;t deactivate your own account.</p>
      ) : null}
    </div>
  );
}

export function ResetPasswordForm({ member }: { member: StaffMember }) {
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { password: '' },
  });

  async function onSubmit(values: ResetPasswordInput) {
    try {
      await apiSend('POST', `/staff/${member.id}/reset-password`, values);
      reset({ password: '' }, { keepIsSubmitSuccessful: true });
    } catch (error) {
      showServerErrors(error, setError);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-md space-y-3" noValidate>
      <FormError message={errors.root?.server?.message} />
      <Field
        id="new-password"
        label="New password"
        hint="At least 8 characters. Tell them the new password directly."
        error={errors.password?.message}
      >
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          {...register('password')}
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Set new password'}
        </Button>
        {isSubmitSuccessful ? (
          <span className="text-sm text-muted-foreground" role="status">
            Password updated
          </span>
        ) : null}
      </div>
    </form>
  );
}
