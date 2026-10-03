import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  REFERENCE_KINDS,
  ReferenceKindSchema,
  type ReferenceItem,
  type ReferenceKind,
} from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { cn } from '@/lib/utils';
import { ReferenceList } from './reference-list';

export const metadata: Metadata = { title: 'Reference lists' };

export default async function ReferencePage({ params }: { params: Promise<{ kind: string }> }) {
  const user = await getSessionUser();
  if (!can(user, 'settings.manage')) return <NoAccess />;

  const parsed = ReferenceKindSchema.safeParse((await params).kind);
  if (!parsed.success) notFound();
  const kind = parsed.data;
  const items = await apiGet<ReferenceItem[]>(`/reference/${kind}?includeInactive=true`);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reference lists"
        description="The lists used across the catalogue and companies. Items in use can't be deleted: deactivate them instead, which hides them from pickers but keeps past records intact."
      />
      <nav className="flex flex-wrap gap-1 border-b" aria-label="Lists">
        {(Object.keys(REFERENCE_KINDS) as ReferenceKind[]).map((key) => (
          <Link
            key={key}
            href={`/reference/${key}`}
            aria-current={key === kind ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              key === kind
                ? 'border-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {REFERENCE_KINDS[key].label}
          </Link>
        ))}
      </nav>
      <p className="text-sm text-muted-foreground">
        Lower order numbers come first in lists and pickers.
      </p>
      <ReferenceList kind={kind} singular={REFERENCE_KINDS[kind].singular} items={items} />
    </div>
  );
}
