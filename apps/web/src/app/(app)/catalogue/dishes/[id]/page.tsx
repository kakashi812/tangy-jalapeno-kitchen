import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type {
  DishDetail,
  ItemTierPrice,
  OptionSummary,
  Paginated,
  ReferenceItem,
} from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { DishForm } from '../dish-form';
import { DishImage } from './dish-image';
import { DishPrices } from './dish-prices';
import { OptionGroupsEditor } from './option-groups-editor';

export const metadata: Metadata = { title: 'Dish' };

async function loadDish(id: string): Promise<DishDetail> {
  try {
    return await apiGet<DishDetail>(`/dishes/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }
}

export default async function DishPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!can(user, 'catalogue.read')) return <NoAccess />;
  const canEdit = can(user, 'catalogue.manage');

  const { id } = await params;
  // All independent, so fetched in parallel.
  const showPrices = can(user, 'pricing.read');
  const [dish, stations, allergens, dietaryTags, options, prices] = await Promise.all([
    loadDish(id),
    apiGet<ReferenceItem[]>('/reference/stations?includeInactive=true'),
    apiGet<ReferenceItem[]>('/reference/allergens?includeInactive=true'),
    apiGet<ReferenceItem[]>('/reference/dietary-tags?includeInactive=true'),
    apiGet<Paginated<OptionSummary>>('/options?status=all&pageSize=100'),
    showPrices ? apiGet<ItemTierPrice[]>(`/dishes/${id}/prices`) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href="/catalogue/dishes" className="text-sm text-muted-foreground hover:underline">
          ← Dishes
        </Link>
        <PageHeader
          title={dish.name}
          description={`${dish.sku} · ${dish.station?.name ?? 'Unassigned station'}`}
          actions={!dish.isActive ? <Badge variant="outline">Inactive</Badge> : null}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="space-y-3">
          <h2 className="font-heading text-lg font-bold">Details</h2>
          <DishForm dish={dish} refs={{ stations, allergens, dietaryTags }} readOnly={!canEdit} />
        </section>
        <section className="space-y-3">
          <h2 className="font-heading text-lg font-bold">Photo</h2>
          <DishImage dish={dish} canEdit={canEdit} />
        </section>
      </div>

      {showPrices ? (
        <section id="prices" className="scroll-mt-6 space-y-3">
          <div className="space-y-1">
            <h2 className="font-heading text-lg font-bold">Prices</h2>
            <p className="text-sm text-muted-foreground">
              The selling price of the dish itself on each tier (options are priced separately).
              Edit prices in each tier.
            </p>
          </div>
          <DishPrices prices={prices} sku={dish.sku} />
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-bold">Option groups</h2>
          <p className="text-sm text-muted-foreground">
            The choices made when ordering this dish, in display order.
          </p>
        </div>
        <OptionGroupsEditor dish={dish} options={options.items} canEdit={canEdit} />
      </section>
    </div>
  );
}
