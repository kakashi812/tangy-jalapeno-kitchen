'use client';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  InvoiceCreateSchema,
  formatCents,
  formatKitchenDate,
  type BillingOrder,
  type InvoiceCreate,
} from '@fernleaf/shared';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/form/field';
import { apiSend } from '@/lib/api/client';
import { showServerErrors } from '@/lib/forms';
export function InvoiceForm({ companyId, orders }: { companyId: string; orders: BillingOrder[] }) {
  const router = useRouter();
  const form = useForm<InvoiceCreate>({
    resolver: zodResolver(InvoiceCreateSchema),
    defaultValues: { companyId, orders: [] },
  });
  const selected = useWatch({ control: form.control, name: 'orders' }) ?? [];
  const selectedIds = new Set(selected.map((o) => o.id));
  const amount = orders.filter((o) => selectedIds.has(o.id)).reduce((n, o) => n + o.totalCents, 0);
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (input) => {
        form.clearErrors();
        try {
          const result = await apiSend<{ id: string }>('POST', '/billing/invoices', input);
          router.push(`/billing/${result.id}`);
          router.refresh();
        } catch (e) {
          showServerErrors(e, form.setError);
          router.refresh();
        }
      })}
    >
      <FormError
        message={
          form.formState.errors.root?.server?.message ?? form.formState.errors.orders?.message
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Selections apply to this page only.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={form.formState.isSubmitting}
          onClick={() =>
            form.setValue(
              'orders',
              selected.length === orders.length
                ? []
                : orders.map((o) => ({ id: o.id, version: o.version })),
              { shouldValidate: true },
            )
          }
        >
          {selected.length === orders.length ? 'Clear selection' : 'Select this page'}
        </Button>
      </div>
      <div className="divide-y rounded-lg border">
        {orders.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-start gap-3 p-4">
            <input
              type="checkbox"
              className="mt-1 size-4"
              aria-label={`Select ${o.number}`}
              checked={selectedIds.has(o.id)}
              disabled={form.formState.isSubmitting}
              onChange={(e) =>
                form.setValue(
                  'orders',
                  e.target.checked
                    ? [...selected, { id: o.id, version: o.version }]
                    : selected.filter((x) => x.id !== o.id),
                  { shouldValidate: true },
                )
              }
            />
            <span className="min-w-0 flex-1">
              <span className="font-medium">
                {o.number} · {o.employeeName}
              </span>
              <span className="block text-sm text-muted-foreground">
                {formatKitchenDate(o.deliveryDate)} · {o.status}
              </span>
              {o.shortDeliveryNote && (
                <span className="block text-sm text-amber-700">
                  Short delivery reported: {o.shortDeliveryNote}. Full saved amount retained.
                </span>
              )}
            </span>
            <span className="tabular-nums">{formatCents(o.totalCents)}</span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          {selected.length} selected · <strong>{formatCents(amount)}</strong>
        </p>
        <Button type="submit" disabled={!selected.length || form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Creating…' : 'Create internal invoice'}
        </Button>
      </div>
    </form>
  );
}
