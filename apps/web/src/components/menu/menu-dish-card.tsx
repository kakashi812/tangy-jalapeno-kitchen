import Image from 'next/image';
import { AlertTriangle, Check, Flame, Snowflake } from 'lucide-react';
import { formatCents, type MenuDish } from '@fernleaf/shared';
import { Badge } from '@/components/ui/badge';

/** "Required: choose 1", "Optional: up to 2"… */
export function groupRule(min: number, max: number): string {
  if (min === 0) return `Optional: up to ${max}`;
  if (min === max) return `Required: choose ${min}`;
  return `Required: choose ${min} to ${max}`;
}

/**
 * A dish as one employee sees it: their price, plus warnings for their allergies (dish and
 * individual options) and whether it fits their diet. Nothing is hidden for allergies: staff may
 * still choose it deliberately (decision 23).
 */
export function MenuDishCard({
  dish,
  employeeName,
  footer,
}: {
  dish: MenuDish;
  employeeName: string;
  footer?: React.ReactNode;
}) {
  const firstName = employeeName.split(' ')[0];
  return (
    <article className="flex w-full flex-col overflow-hidden rounded-xl border bg-card">
      <div className="relative aspect-[16/10] bg-muted">
        {dish.imageUrl ? (
          <Image
            src={dish.imageUrl}
            alt=""
            fill
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 100vw"
            className="object-cover"
          />
        ) : null}
        <Badge variant="secondary" className="absolute top-2 left-2 bg-background/90">
          {dish.temperature === 'HOT' ? (
            <Flame className="size-3 text-orange-600" aria-hidden />
          ) : (
            <Snowflake className="size-3 text-sky-600" aria-hidden />
          )}
          {dish.temperature === 'HOT' ? 'Hot' : 'Cold'}
        </Badge>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-heading text-lg leading-tight font-bold">{dish.name}</h3>
          <span className="text-lg font-semibold tabular-nums">{formatCents(dish.priceCents)}</span>
        </div>
        {dish.description ? (
          <p className="text-sm text-muted-foreground">{dish.description}</p>
        ) : null}
        <div className="flex flex-wrap gap-1">
          {dish.allergyConflicts.length > 0 ? (
            <Badge variant="destructive">
              <AlertTriangle className="size-3" aria-hidden />
              Contains {dish.allergyConflicts.map((a) => a.name.toLowerCase()).join(', ')}:{' '}
              {firstName} is allergic
            </Badge>
          ) : null}
          {dish.fitsDiet ? (
            <Badge variant="secondary">
              <Check className="size-3" aria-hidden /> Fits {firstName}&apos;s diet
            </Badge>
          ) : null}
          {dish.minOrderQty ? (
            <Badge variant="outline">Min. {dish.minOrderQty} per order</Badge>
          ) : null}
        </div>
        {dish.groups.length > 0 ? (
          <dl className="space-y-1.5 text-sm">
            {dish.groups.map((group) => (
              <div key={group.id}>
                <dt className="font-medium">
                  {group.name}{' '}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({groupRule(group.minSelect, group.maxSelect)})
                  </span>
                </dt>
                <dd className="text-muted-foreground">
                  {group.options.map((option, index) => (
                    <span
                      key={option.id}
                      className={
                        option.allergyConflicts.length > 0 ? 'text-destructive' : undefined
                      }
                    >
                      {index > 0 ? ', ' : ''}
                      {option.name}
                      {option.priceCents > 0 ? ` +${formatCents(option.priceCents)}` : ''}
                      {option.allergyConflicts.length > 0 ? ' ⚠' : ''}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {footer ? <div className="mt-auto pt-2">{footer}</div> : null}
      </div>
    </article>
  );
}
