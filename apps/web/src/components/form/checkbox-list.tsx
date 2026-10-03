'use client';

import { Checkbox } from '@/components/ui/checkbox';

type Item = { id: string; name: string; isActive: boolean };

/**
 * Pick several items (allergens, dietary tags…) by ticking boxes. Inactive items are shown only if
 * already selected, so old data stays visible but can't be newly chosen.
 */
export function CheckboxList({
  items,
  value,
  onChange,
  disabled,
}: {
  items: Item[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const visible = items.filter((item) => item.isActive || value.includes(item.id));
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {visible.map((item) => (
        <label key={item.id} className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={value.includes(item.id)}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange(checked ? [...value, item.id] : value.filter((id) => id !== item.id))
            }
          />
          {item.name}
          {!item.isActive ? (
            <span className="text-xs text-muted-foreground">(inactive)</span>
          ) : null}
        </label>
      ))}
    </div>
  );
}
