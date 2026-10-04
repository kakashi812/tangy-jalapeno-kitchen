'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import {
  DELIVERY_PHOTO_MAX_BYTES,
  DeliveryInputSchema,
  type DeliveryInput,
} from '@fernleaf/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormError } from '@/components/form/field';
import { ApiRequestError, toApiRequestError } from '@/lib/api/api-error';

async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot process photos');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Could not compress photo'))),
        'image/jpeg',
        0.82,
      ),
    );
    if (blob.size > DELIVERY_PHOTO_MAX_BYTES)
      throw new Error('Choose a smaller photo (compressed limit: 2 MB)');
    return blob;
  } finally {
    bitmap.close();
  }
}
export function DeliveryForm({ id, version }: { id: string; version: number }) {
  const router = useRouter();
  const [pending, transition] = useTransition();
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState<File>();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof DeliveryInputSchema>, unknown, DeliveryInput>({
    resolver: zodResolver(DeliveryInputSchema),
    defaultValues: { version, note: '' },
  });
  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={handleSubmit((input) => {
        setError('');
        transition(async () => {
          try {
            const data = new FormData();
            data.set('version', String(version));
            data.set('note', input.note);
            if (photo) data.set('photo', await compress(photo), 'delivery.jpg');
            const response = await fetch(`/api/deliveries/${id}/deliver`, {
              method: 'POST',
              body: data,
            });
            if (!response.ok) throw await toApiRequestError(response);
            router.refresh();
          } catch (error) {
            setError(
              error instanceof ApiRequestError && Object.keys(error.fieldErrors).length
                ? Object.values(error.fieldErrors).flat().join(' ')
                : error instanceof Error
                  ? error.message
                  : 'Could not record delivery',
            );
          }
        });
      })}
    >
      <h2 className="font-heading text-xl font-bold">Complete delivery</h2>
      <label className="block space-y-1 text-sm">
        <span>Delivery note (optional)</span>
        <Input {...register('note')} maxLength={2000} disabled={pending} />
      </label>
      {errors.note && <p className="text-sm text-destructive">{errors.note.message}</p>}
      <label className="block space-y-1 text-sm">
        <span>Photo (optional; resized to 1600 px)</span>
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          disabled={pending}
          onChange={(event) => setPhoto(event.target.files?.[0])}
        />
      </label>
      <FormError message={error} />
      <Button type="submit" disabled={pending}>
        {pending ? 'Recording delivery…' : 'Mark delivered'}
      </Button>
    </form>
  );
}
