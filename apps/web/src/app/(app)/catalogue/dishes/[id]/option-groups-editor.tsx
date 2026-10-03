'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import {
  DishOptionGroupsSchema,
  toFieldErrors,
  type DishDetail,
  type OptionSummary,
} from '@fernleaf/shared';
import { FormError, selectClassName } from '@/components/form/field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiSend } from '@/lib/api/client';

type DraftGroup = {
  key: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  optionIds: string[];
};

function fromDish(dish: DishDetail): DraftGroup[] {
  return dish.optionGroups.map((group) => ({
    key: group.id,
    name: group.name,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    optionIds: group.options.map((o) => o.id),
  }));
}

/** The saved shape of a group (the editor's own `key` is dropped). */
function toInput(group: DraftGroup) {
  return {
    name: group.name,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    optionIds: group.optionIds,
  };
}

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

/** "Required: choose 1", "Optional: up to 2", "Choose 1 to 3"… */
function describeRule(min: number, max: number): string {
  if (min === 0) return `Optional: up to ${max}`;
  if (min === max) return `Required: choose ${min}`;
  return `Required: choose ${min} to ${max}`;
}

/**
 * Edits all of a dish's option groups and saves them together. Each group has a name, how many
 * choices are allowed (min/max; min ≥ 1 makes it required) and its options in display order. An
 * option can be in only one group of a dish. Rules are checked here with the same shared schema the
 * API uses, so mistakes show before saving.
 */
export function OptionGroupsEditor({
  dish,
  options,
  canEdit,
}: {
  dish: DishDetail;
  options: OptionSummary[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [groups, setGroups] = useState<DraftGroup[]>(() => fromDish(dish));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const optionById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const used = new Set(groups.flatMap((g) => g.optionIds));
  const dirty = JSON.stringify(groups.map(toInput)) !== JSON.stringify(fromDish(dish).map(toInput));

  const update = (index: number, change: Partial<DraftGroup>) => {
    setSaved(false);
    setGroups((current) => current.map((g, i) => (i === index ? { ...g, ...change } : g)));
  };
  const errorsFor = (index: number) =>
    Object.entries(errors)
      .filter(([path]) => path === `groups.${index}` || path.startsWith(`groups.${index}.`))
      .flatMap(([, messages]) => messages);

  async function save() {
    const body = { groups: groups.map(toInput) };
    const checked = DishOptionGroupsSchema.safeParse(body);
    if (!checked.success) {
      setErrors(toFieldErrors(checked.error));
      setFormError('Fix the problems shown below, then save.');
      return;
    }
    setSaving(true);
    setErrors({});
    setFormError(undefined);
    try {
      const result = await apiSend<DishDetail>(
        'PUT',
        `/dishes/${dish.id}/option-groups`,
        checked.data,
      );
      setGroups(fromDish(result));
      setSaved(true);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrors(error.fieldErrors);
        setFormError(error.message);
      } else {
        setFormError('Could not reach the server. Check your connection and try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) {
    return groups.length === 0 ? (
      <p className="text-sm text-muted-foreground">No option groups: ordered as is.</p>
    ) : (
      <ol className="space-y-3">
        {groups.map((group) => (
          <li key={group.key} className="rounded-lg border p-3 text-sm">
            <div className="font-medium">{group.name}</div>
            <div className="text-muted-foreground">
              {describeRule(group.minSelect, group.maxSelect)}
            </div>
            <div>
              {group.optionIds.map((id) => optionById.get(id)?.name ?? 'Unknown').join(', ')}
            </div>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <FormError message={formError} />
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No option groups. The dish is ordered as is (one combination with no choices).
        </p>
      ) : null}

      {groups.map((group, index) => {
        const available = options.filter((o) => o.isActive && !used.has(o.id));
        const groupErrors = errorsFor(index);
        return (
          <section
            key={group.key}
            className="space-y-3 rounded-lg border p-4"
            aria-label={`Group ${index + 1}`}
          >
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-48 flex-1 space-y-1 text-sm">
                <span className="font-medium">Group name</span>
                <Input
                  value={group.name}
                  placeholder="e.g. Choose your protein"
                  onChange={(e) => update(index, { name: e.target.value })}
                />
              </label>
              <label className="w-24 space-y-1 text-sm">
                <span className="font-medium">Min</span>
                <Input
                  type="number"
                  min={0}
                  value={group.minSelect}
                  onChange={(e) => update(index, { minSelect: Number(e.target.value) })}
                />
              </label>
              <label className="w-24 space-y-1 text-sm">
                <span className="font-medium">Max</span>
                <Input
                  type="number"
                  min={1}
                  value={group.maxSelect}
                  onChange={(e) => update(index, { maxSelect: Number(e.target.value) })}
                />
              </label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Move group up"
                  disabled={index === 0}
                  onClick={() => setGroups(move(groups, index, index - 1))}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Move group down"
                  disabled={index === groups.length - 1}
                  onClick={() => setGroups(move(groups, index, index + 1))}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove group"
                  onClick={() => setGroups(groups.filter((_, i) => i !== index))}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {describeRule(group.minSelect, group.maxSelect)}
            </p>

            <ol className="space-y-1">
              {group.optionIds.map((optionId, optionIndex) => {
                const option = optionById.get(optionId);
                return (
                  <li
                    key={optionId}
                    className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-1.5 text-sm"
                  >
                    <span className="flex-1">
                      {option?.name ?? 'Unknown option'}{' '}
                      {option && !option.isActive ? (
                        <Badge variant="outline">Inactive</Badge>
                      ) : null}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Move option up"
                      disabled={optionIndex === 0}
                      onClick={() =>
                        update(index, {
                          optionIds: move(group.optionIds, optionIndex, optionIndex - 1),
                        })
                      }
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Move option down"
                      disabled={optionIndex === group.optionIds.length - 1}
                      onClick={() =>
                        update(index, {
                          optionIds: move(group.optionIds, optionIndex, optionIndex + 1),
                        })
                      }
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove option"
                      onClick={() =>
                        update(index, {
                          optionIds: group.optionIds.filter((id) => id !== optionId),
                        })
                      }
                    >
                      <X className="size-3.5" />
                    </Button>
                  </li>
                );
              })}
            </ol>

            <select
              className={`${selectClassName} max-w-xs`}
              aria-label="Add an option"
              value=""
              onChange={(e) =>
                e.target.value && update(index, { optionIds: [...group.optionIds, e.target.value] })
              }
            >
              <option value="">Add an option…</option>
              {available.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>

            {groupErrors.length > 0 ? (
              <ul className="text-sm text-destructive" role="alert">
                {groupErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setSaved(false);
            setGroups([
              ...groups,
              { key: crypto.randomUUID(), name: '', minSelect: 1, maxSelect: 1, optionIds: [] },
            ]);
          }}
        >
          Add group
        </Button>
        <Button type="button" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save option groups'}
        </Button>
        {saved && !dirty ? (
          <span className="text-sm text-muted-foreground" role="status">
            Saved
          </span>
        ) : null}
      </div>
    </div>
  );
}
