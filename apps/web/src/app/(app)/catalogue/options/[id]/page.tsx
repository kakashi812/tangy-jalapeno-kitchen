import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { OptionDetail, ReferenceItem } from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { DeleteOptionButton, OptionForm } from '../option-form';

export const metadata: Metadata = { title: 'Option' };

async function loadOption(id: string): Promise<OptionDetail> {
  try {
    return await apiGet<OptionDetail>(`/options/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }
}

export default async function OptionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!can(user, 'catalogue.read')) return <NoAccess />;
  const canEdit = can(user, 'catalogue.manage');
  const { id } = await params;
  const [option, allergens, dietaryTags] = await Promise.all([
    loadOption(id),
    apiGet<ReferenceItem[]>('/reference/allergens?includeInactive=true'),
    apiGet<ReferenceItem[]>('/reference/dietary-tags?includeInactive=true'),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href="/catalogue/options" className="text-sm text-muted-foreground hover:underline">
          ← Options
        </Link>
        <PageHeader
          title={option.name}
          actions={!option.isActive ? <Badge variant="outline">Inactive</Badge> : null}
        />
      </div>

      <OptionForm
        option={option}
        allergens={allergens}
        dietaryTags={dietaryTags}
        readOnly={!canEdit}
      />

      <section className="space-y-2">
        <h2 className="font-heading text-lg font-bold">Offered by</h2>
        {option.usedBy.length === 0 ? (
          <p className="text-sm text-muted-foreground">No dish offers this option yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {option.usedBy.map((dish) => (
              <li key={dish.id}>
                <Link href={`/catalogue/dishes/${dish.id}`} className="hover:underline">
                  {dish.name}
                </Link>{' '}
                <span className="text-muted-foreground">{dish.sku}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEdit ? (
        <section className="space-y-3 border-t pt-6">
          <h2 className="font-medium">Delete</h2>
          <DeleteOptionButton option={option} />
        </section>
      ) : null}
    </div>
  );
}
