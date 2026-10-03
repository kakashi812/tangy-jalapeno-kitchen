'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import type { AdminMenuCategory, MenuHiding } from '@fernleaf/shared';
import { FormError } from '@/components/form/field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiSend } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/**
 * Which categories and dishes this company doesn't see (brief 4.2, 4.4). Tick to hide. Hiding a
 * dish here hides it in that category only (the same dish can sit in several categories).
 */
export function MenuVisibility({
  companyId,
  categories,
  hiding,
  canEdit,
}: {
  companyId: string;
  categories: AdminMenuCategory[];
  hiding: MenuHiding;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [hiddenCategories, setHiddenCategories] = useState(new Set(hiding.hiddenCategoryIds));
  const [hiddenItems, setHiddenItems] = useState(new Set(hiding.hiddenItemIds));
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const same = (a: Set<string>, b: string[]) => a.size === b.length && b.every((id) => a.has(id));
  const dirty =
    !same(hiddenCategories, hiding.hiddenCategoryIds) || !same(hiddenItems, hiding.hiddenItemIds);

  const toggle = (set: Set<string>, id: string, update: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update(next);
    setSaved(false);
  };

  async function save() {
    setSaving(true);
    setError(undefined);
    try {
      await apiSend('PUT', `/companies/${companyId}/menu-hiding`, {
        hiddenCategoryIds: [...hiddenCategories],
        hiddenItemIds: [...hiddenItems],
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not reach the server.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-3">
      <FormError message={error} />
      <ul className="divide-y rounded-lg border">
        {categories.map((category) => {
          const categoryHidden = hiddenCategories.has(category.id);
          return (
            <li key={category.id} className="space-y-2 px-4 py-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={categoryHidden}
                  disabled={!canEdit}
                  onCheckedChange={() => toggle(hiddenCategories, category.id, setHiddenCategories)}
                />
                <span
                  className={cn(
                    'font-medium',
                    categoryHidden && 'text-muted-foreground line-through',
                  )}
                >
                  {category.name}
                </span>
                {category.isSecret ? (
                  <Badge variant="secondary">
                    <KeyRound className="size-3" aria-hidden /> Secret
                  </Badge>
                ) : null}
                {!category.isActive ? <Badge variant="outline">Inactive everywhere</Badge> : null}
                {categoryHidden ? (
                  <span className="text-xs text-muted-foreground">Hidden for this company</span>
                ) : null}
              </label>
              {!categoryHidden && category.items.length > 0 ? (
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 pl-6">
                  {category.items.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-center gap-1.5 text-sm text-muted-foreground"
                    >
                      <Checkbox
                        checked={hiddenItems.has(item.id)}
                        disabled={!canEdit}
                        onCheckedChange={() => toggle(hiddenItems, item.id, setHiddenItems)}
                      />
                      <span className={cn(hiddenItems.has(item.id) && 'line-through')}>
                        {item.dish.name}
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canEdit ? (
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save menu visibility'}
          </Button>
          {saved && !dirty ? <span className="text-sm text-muted-foreground">Saved</span> : null}
        </div>
      ) : null}
    </div>
  );
}
