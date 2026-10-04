'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormError } from '@/components/form/field';
import { apiSend } from '@/lib/api/client';

export function CloseOrders({ today }: { today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function close() {
    if (
      !window.confirm(
        `Close orders for ${date}? Drafts will be cancelled, placed orders confirmed, and normal new orders blocked. This cannot be reopened.`,
      )
    )
      return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await apiSend<{ confirmed: number; cancelled: number }>(
        'POST',
        '/orders/close',
        { deliveryDate: date },
      );
      setMessage(
        `Date closed. ${result.confirmed} confirmed; ${result.cancelled} drafts cancelled.`,
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not close orders');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h2 className="font-heading text-lg font-bold">Close orders now</h2>
      <p className="text-sm text-muted-foreground">
        Processes past cutoffs or closes a future date early. Repeating the action is safe. Admins
        can still place confirmed orders after closure.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          type="date"
          aria-label="Date to close"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-auto"
        />
        <Button variant="destructive" disabled={busy || !date} onClick={close}>
          {busy ? 'Closing…' : 'Close orders now'}
        </Button>
      </div>
      <FormError message={error} />
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
