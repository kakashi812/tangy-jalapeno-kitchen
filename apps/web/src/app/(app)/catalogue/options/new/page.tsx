import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReferenceItem } from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { OptionForm } from '../option-form';

export const metadata: Metadata = { title: 'New option' };

export default async function NewOptionPage() {
  const user = await getSessionUser();
  if (!can(user, 'catalogue.manage')) return <NoAccess />;
  const [allergens, dietaryTags] = await Promise.all([
    apiGet<ReferenceItem[]>('/reference/allergens'),
    apiGet<ReferenceItem[]>('/reference/dietary-tags'),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/catalogue/options" className="text-sm text-muted-foreground hover:underline">
          ← Options
        </Link>
        <PageHeader title="New option" />
      </div>
      <OptionForm allergens={allergens} dietaryTags={dietaryTags} />
    </div>
  );
}
