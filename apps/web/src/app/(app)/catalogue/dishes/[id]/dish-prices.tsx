import Link from 'next/link';
import { formatCents, type ItemTierPrice } from '@fernleaf/shared';
import { Badge } from '@/components/ui/badge';

const SOURCE_LABEL = { derived: 'From rule', override: 'Override', manual: 'Typed' } as const;

/** The dish's selling price on every tier, each linking to that tier's editor. */
export function DishPrices({ prices, sku }: { prices: ItemTierPrice[]; sku: string }) {
  return (
    <ul className="max-w-xl divide-y rounded-lg border">
      {prices.map(({ tier, price }) => (
        <li key={tier.id} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
          <span className="flex items-center gap-2">
            <Link
              href={`/pricing/${tier.id}?q=${encodeURIComponent(sku)}`}
              className="font-medium hover:underline"
            >
              {tier.name}
            </Link>
            {tier.isDefault ? <Badge variant="outline">Default</Badge> : null}
          </span>
          {price ? (
            <span className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{SOURCE_LABEL[price.source]}</span>
              <span className="font-medium tabular-nums">{formatCents(price.cents)}</span>
            </span>
          ) : (
            <Badge variant="destructive">No price: not offered on this tier</Badge>
          )}
        </li>
      ))}
    </ul>
  );
}
