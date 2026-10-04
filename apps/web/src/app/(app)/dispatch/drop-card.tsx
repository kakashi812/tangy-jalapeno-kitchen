import Link from 'next/link';
import { DROP_LABELS, formatTimeOfDay, type DropSummary } from '@fernleaf/shared';
import { Badge } from '@/components/ui/badge';
export function DropCard({ drop, children }: { drop: DropSummary; children?: React.ReactNode }) {
  return (
    <article className="min-w-0 space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link href={`/drops/${drop.id}`} className="font-heading text-xl font-bold underline">
          {drop.company.name} · {formatTimeOfDay(drop.deliveryTimeMinutes)}
        </Link>
        <Badge variant="outline">{DROP_LABELS[drop.state]}</Badge>
      </div>
      <p className="break-words text-sm">{drop.addressText}</p>
      <p className="text-sm">
        {drop.orderCount} {drop.orderCount === 1 ? 'order' : 'orders'} · {drop.readyOrderCount}{' '}
        kitchen-ready
      </p>
      <p className="text-sm text-muted-foreground">
        Driver: {drop.driver?.name ?? 'Unassigned'}
        {drop.driver && !drop.driver.isActive ? ' (inactive)' : ''}
      </p>
      {drop.onTime !== null && (
        <p className={drop.onTime ? 'text-sm text-green-700' : 'text-sm text-red-700'}>
          {drop.onTime ? 'Delivered on time' : 'Delivered late'}
        </p>
      )}
      {children}
    </article>
  );
}
