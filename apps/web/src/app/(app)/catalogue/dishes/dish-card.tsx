import Image from 'next/image';
import Link from 'next/link';
import { Flame, Snowflake } from 'lucide-react';
import { formatCents, type DishSummary } from '@fernleaf/shared';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MAX_TAGS = 3;

/**
 * A dish as a card: large photo on top, the essentials underneath. The whole card opens the dish
 * (the name's link is stretched over the card); the Prices button sits above it and opens the
 * dish's prices on every tier.
 */
export function DishCard({ dish, showPrices }: { dish: DishSummary; showPrices: boolean }) {
  const extraTags = dish.dietaryTags.length - MAX_TAGS;
  return (
    <div
      className={cn(
        'group relative flex w-full flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50',
        !dish.isActive && 'opacity-70',
      )}
    >
      <div className="relative aspect-[4/3] bg-muted">
        {dish.imageUrl ? (
          <Image
            src={dish.imageUrl}
            alt=""
            fill
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No photo yet
          </div>
        )}
        <div className="absolute top-2 left-2 flex gap-1">
          <Badge variant="secondary" className="bg-background/90 backdrop-blur">
            {dish.temperature === 'HOT' ? (
              <Flame className="size-3 text-orange-600" aria-hidden />
            ) : (
              <Snowflake className="size-3 text-sky-600" aria-hidden />
            )}
            {dish.temperature === 'HOT' ? 'Hot' : 'Cold'}
          </Badge>
          {!dish.isActive ? (
            <Badge variant="secondary" className="bg-background/90 backdrop-blur">
              Inactive
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="font-heading text-lg leading-tight font-bold">
            <Link
              href={`/catalogue/dishes/${dish.id}`}
              className="outline-none after:absolute after:inset-0"
            >
              {dish.name}
            </Link>
          </h3>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">{dish.sku}</span> ·{' '}
            {dish.station?.name ?? 'Unassigned station'}
          </p>
        </div>

        {dish.dietaryTags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {dish.dietaryTags.slice(0, MAX_TAGS).map((tag) => (
              <Badge key={tag.id} variant="outline" className="font-normal">
                {tag.name}
              </Badge>
            ))}
            {extraTags > 0 ? (
              <Badge variant="outline" className="font-normal">
                +{extraTags}
              </Badge>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-2 pt-2 text-sm">
          <span className="text-muted-foreground">
            {dish.optionGroupCount > 0
              ? `${dish.optionGroupCount} option group${dish.optionGroupCount === 1 ? '' : 's'}`
              : 'No options'}
          </span>
          <span className="flex items-end gap-3">
            {dish.costCents !== undefined ? (
              <span className="text-right">
                <span className="block text-xs text-muted-foreground">Cost</span>
                <span className="font-medium">{formatCents(dish.costCents)}</span>
              </span>
            ) : null}
            {showPrices ? (
              <Link
                href={`/catalogue/dishes/${dish.id}#prices`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'relative z-10')}
              >
                Prices
              </Link>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}
