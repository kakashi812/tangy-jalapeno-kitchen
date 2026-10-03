'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, KeyRound } from 'lucide-react';
import type { AdminMenuCategory } from '@fernleaf/shared';
import { FormError } from '@/components/form/field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiSend } from '@/lib/api/client';

/** Categories in display order: reorder with the arrows; open one to edit its dishes. */
export function CategoryList({
  categories,
  canEdit,
}: {
  categories: AdminMenuCategory[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [order, setOrder] = useState(categories);
  const [error, setError] = useState<string>();
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);

  async function move(index: number, to: number) {
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item!);
    setOrder(next);
    try {
      await apiSend('PUT', '/menu/category-order', { ids: next.map((c) => c.id) });
      router.refresh();
    } catch (err) {
      setOrder(order);
      setError(err instanceof ApiRequestError ? err.message : 'Could not reach the server.');
    }
  }

  async function create() {
    setPending(true);
    setError(undefined);
    try {
      const created = await apiSend<AdminMenuCategory>('POST', '/menu/categories', {
        name,
        isActive: true,
        isSecret: false,
        accessCode: null,
      });
      router.push(`/menu/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? (Object.values(err.fieldErrors)[0]?.[0] ?? err.message)
          : 'Could not reach the server.',
      );
      setPending(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-3">
      <FormError message={error} />
      <ol className="divide-y rounded-lg border">
        {order.map((category, index) => (
          <li key={category.id} className="flex items-center gap-3 px-4 py-3">
            <span className="w-6 text-right text-sm text-muted-foreground tabular-nums">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <Link href={`/menu/${category.id}`} className="font-medium hover:underline">
                {category.name}
              </Link>
              <div className="text-xs text-muted-foreground">
                {category.items.length} dish{category.items.length === 1 ? '' : 'es'}
              </div>
            </div>
            {category.isSecret ? (
              <Badge variant="secondary">
                <KeyRound className="size-3" aria-hidden /> Secret
              </Badge>
            ) : null}
            {!category.isActive ? <Badge variant="outline">Inactive</Badge> : null}
            {canEdit ? (
              <span className="flex">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Move down"
                  disabled={index === order.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      {canEdit ? (
        <form
          className="flex max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <Input
            aria-label="New category name"
            placeholder="New category, e.g. Soups"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={pending || !name.trim()}>
            Add category
          </Button>
        </form>
      ) : null}
    </div>
  );
}
