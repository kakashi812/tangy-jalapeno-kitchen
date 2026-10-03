import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { AdminMenuCategory, DishSummary, Paginated } from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { CategoryItems, CategorySettings } from './category-editor';

export const metadata: Metadata = { title: 'Menu category' };

export default async function CategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!can(user, 'menu.read')) return <NoAccess />;
  const { id } = await params;
  let category: AdminMenuCategory;
  try {
    category = await apiGet<AdminMenuCategory>(`/menu/categories/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }
  const dishes = await apiGet<Paginated<DishSummary>>('/dishes?status=all&pageSize=100');
  const canEdit = can(user, 'menu.manage');

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href="/menu" className="text-sm text-muted-foreground hover:underline">
          ← Menu
        </Link>
        <PageHeader
          title={category.name}
          description={`${category.items.length} dishes${category.isSecret ? ' · secret' : ''}`}
        />
      </div>
      {canEdit ? (
        <>
          <section className="space-y-3">
            <h2 className="font-heading text-lg font-bold">Dishes in this category</h2>
            <CategoryItems
              key={JSON.stringify(category.items)}
              category={category}
              dishes={dishes.items}
            />
          </section>
          <section className="space-y-3 border-t pt-6">
            <h2 className="font-heading text-lg font-bold">Category settings</h2>
            <CategorySettings key={JSON.stringify(category)} category={category} />
          </section>
        </>
      ) : (
        <ul className="list-disc pl-5 text-sm">
          {category.items.map((item) => (
            <li key={item.id}>{item.dish.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
