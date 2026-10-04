'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShortDeliverySchema, type BillingOrder, type InvoiceSummary } from '@fernleaf/shared';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, FormError, textareaClassName } from '@/components/form/field';
import { apiSend } from '@/lib/api/client';
import { showServerErrors } from '@/lib/forms';

export function PayInvoice({ invoice }: { invoice: InvoiceSummary }) {
  const router = useRouter();
  const [pending, transition] = useTransition();
  const [error, setError] = useState('');
  if (invoice.paidAt) return null;
  return (
    <div className="space-y-2">
      <FormError message={error} />
      <Button
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm('Record this entire internal invoice as paid? No payment is collected.')
          )
            return;
          setError('');
          transition(async () => {
            try {
              await apiSend('POST', `/billing/invoices/${invoice.id}/pay`, {
                version: invoice.version,
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not record payment');
            }
            router.refresh();
          });
        }}
      >
        {pending ? 'Saving…' : 'Mark paid in full'}
      </Button>
    </div>
  );
}
export function ReportShort({ order }: { order: BillingOrder }) {
  const router = useRouter();
  const form = useForm<z.infer<typeof ShortDeliverySchema>>({
    resolver: zodResolver(ShortDeliverySchema),
    defaultValues: { version: order.version, note: order.shortDeliveryNote },
  });
  if (order.status !== 'DELIVERED') return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm text-primary">Report short delivery</summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={form.handleSubmit(async (input) => {
          form.clearErrors();
          try {
            await apiSend('POST', `/billing/orders/${order.id}/short`, input);
            router.refresh();
          } catch (e) {
            showServerErrors(e, form.setError);
          }
        })}
      >
        <FormError message={form.formState.errors.root?.server?.message} />
        <Field
          id={`short-${order.id}`}
          label="What was missing?"
          error={form.formState.errors.note?.message}
          hint="Staff review only. Saved order and invoice amounts do not change."
        >
          <textarea
            id={`short-${order.id}`}
            className={textareaClassName}
            defaultValue={order.shortDeliveryNote}
            {...form.register('note')}
          />
        </Field>
        <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
          Save report
        </Button>
      </form>
    </details>
  );
}
