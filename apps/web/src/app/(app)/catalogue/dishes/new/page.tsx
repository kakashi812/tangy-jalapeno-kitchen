import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReferenceItem } from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { DishForm } from '../dish-form';

export const metadata: Metadata = { title: 'New dish' };

export default async function NewDishPage() {
  const user = await getSessionUser();
  if (!can(user, 'catalogue.manage')) return <NoAccess />;
  const [stations, allergens, dietaryTags] = await Promise.all([
    apiGet<ReferenceItem[]>('/reference/stations'),
    apiGet<ReferenceItem[]>('/reference/allergens'),
    apiGet<ReferenceItem[]>('/reference/dietary-tags'),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/catalogue/dishes" className="text-sm text-muted-foreground hover:underline">
          ← Dishes
        </Link>
        <PageHeader
          title="New dish"
          description="After creating it you can add a photo and option groups."
        />
      </div>
      <DishForm refs={{ stations, allergens, dietaryTags }} />
    </div>
  );
}
