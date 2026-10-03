'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { DISH_IMAGE_MAX_BYTES, DISH_IMAGE_TYPES, type DishDetail } from '@fernleaf/shared';
import { FormError } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiUpload } from '@/lib/api/client';

/** Shows the dish photo and, for editors, replaces it (stored in Vercel Blob by the API). */
export function DishImage({ dish, canEdit }: { dish: DishDetail; canEdit: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function upload(file: File) {
    // Checked here for a quick answer; the API checks the same rules.
    if (!(DISH_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setError('Use a JPEG, PNG or WebP image');
      return;
    }
    if (file.size > DISH_IMAGE_MAX_BYTES) {
      setError('The image must be 2 MB or smaller');
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await apiUpload<DishDetail>(`/dishes/${dish.id}/image`, 'image', file);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? (Object.values(err.fieldErrors)[0]?.[0] ?? err.message)
          : 'Upload failed. Check your connection and try again.',
      );
    } finally {
      setPending(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="space-y-3">
      {dish.imageUrl ? (
        <Image
          src={dish.imageUrl}
          alt={dish.name}
          width={360}
          height={270}
          className="aspect-[4/3] w-full max-w-sm rounded-lg object-cover"
          priority
        />
      ) : (
        <div className="flex aspect-[4/3] w-full max-w-sm items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
          No photo yet
        </div>
      )}
      {canEdit ? (
        <div className="space-y-2">
          <input
            ref={input}
            type="file"
            accept={DISH_IMAGE_TYPES.join(',')}
            className="sr-only"
            id="dish-image"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => input.current?.click()}
          >
            {pending ? 'Uploading…' : dish.imageUrl ? 'Replace photo' : 'Upload photo'}
          </Button>
          <p className="text-xs text-muted-foreground">JPEG, PNG or WebP, up to 2 MB.</p>
          <FormError message={error} />
        </div>
      ) : null}
    </div>
  );
}
