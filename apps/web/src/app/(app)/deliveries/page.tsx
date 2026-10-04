import Link from 'next/link';
import { Suspense } from 'react';
import {
  DRIVER_PAST_DAYS,
  DRIVER_UPCOMING_DAYS,
  DeliveryQuerySchema,
  deliveryWindowRange,
  formatKitchenDate,
  kitchenToday,
  type DeliveryWindow,
  type DropSummary,
  type Paginated,
} from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { cn } from '@/lib/utils';
import { DropCard } from '../dispatch/drop-card';
import { RefreshDrops } from '../dispatch/drop-actions';

const TABS: { window: DeliveryWindow; label: string }[] = [
  { window: 'today', label: 'Today' },
  { window: 'upcoming', label: 'Upcoming' },
  { window: 'past', label: 'Past' },
];

const EMPTY: Record<DeliveryWindow, string> = {
  today:
    'No deliveries are assigned to you today. Ask Dispatch if you expected a drop. Closed days can correctly be empty.',
  upcoming: `Nothing is assigned to you in the next ${DRIVER_UPCOMING_DAYS} days yet.`,
  past: `You have no drops in the last ${DRIVER_PAST_DAYS} days.`,
};

/** Tab badges: only the total of each other window is needed, so ask for one row. */
async function Counts() {
  const totals = await Promise.all(
    TABS.map((t) =>
      apiGet<Paginated<DropSummary>>(`/deliveries?window=${t.window}&pageSize=1`).then(
        (data) => [t.window, data.total] as const,
      ),
    ),
  );
  return Object.fromEntries(totals) as Record<DeliveryWindow, number>;
}

async function Tabs({ active }: { active: DeliveryWindow }) {
  const counts = await Counts();
  return (
    <nav aria-label="Delivery days" className="flex gap-1 rounded-lg border bg-muted/40 p-1">
      {TABS.map((tab) => (
        <Link
          key={tab.window}
          href={tab.window === 'today' ? '/deliveries' : `/deliveries?window=${tab.window}`}
          aria-current={tab.window === active ? 'page' : undefined}
          className={cn(
            'flex-1 rounded-md px-3 py-2 text-center text-sm font-medium',
            tab.window === active
              ? 'bg-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label} <span className="tabular-nums">({counts[tab.window]})</span>
        </Link>
      ))}
    </nav>
  );
}

async function Content({ window, page }: { window: DeliveryWindow; page: number }) {
  const data = await apiGet<Paginated<DropSummary>>(`/deliveries?window=${window}&page=${page}`);
  // Today is a single date; the other tabs span many, so group them under date headings.
  const byDate = new Map<string, DropSummary[]>();
  for (const drop of data.items)
    byDate.set(drop.deliveryDate, [...(byDate.get(drop.deliveryDate) ?? []), drop]);
  return (
    <>
      {window === 'today' && <RefreshDrops />}
      <div className="space-y-6">
        {[...byDate].map(([date, drops]) => (
          <section key={date} className="space-y-3">
            {window !== 'today' && (
              <h2 className="font-heading text-lg font-bold">{formatKitchenDate(date)}</h2>
            )}
            {drops.map((drop) => (
              <DropCard key={drop.id} drop={drop} />
            ))}
          </section>
        ))}
      </div>
      {!data.items.length && (
        <p className="rounded-lg border p-6 text-muted-foreground">{EMPTY[window]}</p>
      )}
      <Pagination pathname="/deliveries" params={window === 'today' ? {} : { window }} {...data} />
    </>
  );
}

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; window?: string }>;
}) {
  const user = await getSessionUser();
  if (!can(user, 'deliveries.own')) return <NoAccess />;
  const params = await searchParams;
  const parsed = DeliveryQuerySchema.safeParse(params),
    query = parsed.success ? parsed.data : DeliveryQuerySchema.parse({});
  const today = kitchenToday(),
    range = deliveryWindowRange(query.window, today);
  const description =
    query.window === 'today'
      ? `Your drops for ${formatKitchenDate(today)} (IST), in delivery-time order. Open a drop for packing details and to mark it delivered.`
      : query.window === 'upcoming'
        ? `Drops assigned to you from ${formatKitchenDate(range.from)} to ${formatKitchenDate(range.to)}. Plans can still change until they leave the kitchen.`
        : `Your drops from ${formatKitchenDate(range.from)} to ${formatKitchenDate(range.to)}, newest first, with when each was delivered and whether it was on time.`;
  return (
    <div className="space-y-6">
      <PageHeader title="My deliveries" description={description} />
      <Suspense fallback={<div className="h-11 animate-pulse rounded-lg bg-muted" />}>
        <Tabs active={query.window} />
      </Suspense>
      <Suspense
        key={`${query.window}-${query.page}`}
        fallback={<div className="h-80 animate-pulse rounded-lg bg-muted" />}
      >
        <Content window={query.window} page={query.page} />
      </Suspense>
    </div>
  );
}
