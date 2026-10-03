'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import type { AdminMenuCategory, DishSummary } from '@fernleaf/shared';
import { Field, FormError, selectClassName } from '@/components/form/field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiSend } from '@/lib/api/client';

function errorText(err: unknown) {
  return err instanceof ApiRequestError
    ? (Object.values(err.fieldErrors)[0]?.[0] ?? err.message)
    : 'Could not reach the server.';
}

/** Name, active and secret (with its access code). */
export function CategorySettings({ category }: { category: AdminMenuCategory }) {
  const router = useRouter();
  const [name, setName] = useState(category.name);
  const [isActive, setIsActive] = useState(category.isActive);
  const [isSecret, setIsSecret] = useState(category.isSecret);
  const [code, setCode] = useState(category.accessCode ?? '');
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const dirty =
    name !== category.name ||
    isActive !== category.isActive ||
    isSecret !== category.isSecret ||
    code !== (category.accessCode ?? '');

  async function save() {
    setError(undefined);
    try {
      await apiSend('PUT', `/menu/categories/${category.id}`, {
        name,
        isActive,
        isSecret,
        accessCode: isSecret ? code : null,
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove() {
    if (
      !window.confirm(`Delete the "${category.name}" category? Its dishes stay in the catalogue.`)
    )
      return;
    try {
      await apiSend('DELETE', `/menu/categories/${category.id}`);
      router.push('/menu');
      router.refresh();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <FormError message={error} />
      <Field id="cat-name" label="Name">
        <Input
          id="cat-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={isActive}
          onCheckedChange={(v) => {
            setIsActive(v);
            setSaved(false);
          }}
        />
        Active (inactive categories don&apos;t appear on any menu)
      </label>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          className="mt-0.5"
          checked={isSecret}
          onCheckedChange={(v) => {
            setIsSecret(v);
            setSaved(false);
          }}
        />
        <span>
          Secret
          <span className="block text-xs text-muted-foreground">
            Not listed on menus. Staff open it with the access code (&quot;Show secret items&quot;).
            Share the code with the people who should see it.
          </span>
        </span>
      </label>
      {isSecret ? (
        <Field id="cat-code" label="Access code" hint="4–20 letters or digits; not case-sensitive.">
          <Input
            id="cat-code"
            className="max-w-48 font-mono uppercase"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setSaved(false);
            }}
          />
        </Field>
      ) : null}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!dirty}>
          Save category
        </Button>
        {saved && !dirty ? <span className="text-sm text-muted-foreground">Saved</span> : null}
        <Button variant="ghost" className="ml-auto" onClick={remove}>
          Delete category
        </Button>
      </div>
    </div>
  );
}

type Item = AdminMenuCategory['items'][number];

/** The category's dishes in display order; saved together. */
export function CategoryItems({
  category,
  dishes,
}: {
  category: AdminMenuCategory;
  dishes: DishSummary[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(category.items);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const signature = (list: Item[]) => JSON.stringify(list.map((i) => [i.dish.id, i.isActive]));
  const dirty = signature(items) !== signature(category.items);
  const available = dishes.filter((d) => !items.some((i) => i.dish.id === d.id));

  const move = (from: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    setItems(next);
  };

  async function save() {
    setSaving(true);
    setError(undefined);
    try {
      await apiSend('PUT', `/menu/categories/${category.id}/items`, {
        items: items.map((i) => ({ dishId: i.dish.id, isActive: i.isActive })),
      });
      router.refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-3">
      <FormError message={error} />
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No dishes in this category yet.</p>
      ) : null}
      <ol className="divide-y rounded-lg border">
        {items.map((item, index) => (
          <li key={item.dish.id} className="flex items-center gap-3 px-4 py-2 text-sm">
            <span className="flex-1">
              <span className="font-medium">{item.dish.name}</span>{' '}
              <span className="font-mono text-xs text-muted-foreground">{item.dish.sku}</span>{' '}
              {!item.dish.isActive ? <Badge variant="outline">Dish inactive</Badge> : null}
            </span>
            <label className="flex items-center gap-1.5 text-xs">
              <Checkbox
                checked={item.isActive}
                onCheckedChange={(v) =>
                  setItems(items.map((i, n) => (n === index ? { ...i, isActive: v } : i)))
                }
              />
              Shown
            </label>
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
              disabled={index === items.length - 1}
              onClick={() => move(index, index + 1)}
            >
              <ArrowDown className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Remove from category"
              onClick={() => setItems(items.filter((_, n) => n !== index))}
            >
              <X className="size-4" />
            </Button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Add a dish"
          className={`${selectClassName} max-w-xs`}
          value=""
          onChange={(e) => {
            const dish = dishes.find((d) => d.id === e.target.value);
            if (dish)
              setItems([
                ...items,
                {
                  id: '',
                  isActive: true,
                  dish: {
                    id: dish.id,
                    name: dish.name,
                    sku: dish.sku,
                    isActive: dish.isActive,
                    imageUrl: dish.imageUrl,
                  },
                },
              ]);
          }}
        >
          <option value="">Add a dish…</option>
          {available.map((dish) => (
            <option key={dish.id} value={dish.id}>
              {dish.name}
            </option>
          ))}
        </select>
        <Button onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save dishes'}
        </Button>
      </div>
    </div>
  );
}
