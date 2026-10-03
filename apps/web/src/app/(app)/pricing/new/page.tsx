import type { Metadata } from 'next';
import Link from 'next/link';
import type { TierSummary } from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { TierForm } from '../tier-form';

export const metadata: Metadata = { title: 'New price tier' };

export default async function NewTierPage() {
  const user = await getSessionUser();
  if (!can(user, 'pricing.manage')) return <NoAccess />;
  const tiers = await apiGet<TierSummary[]>('/price-tiers');
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/pricing" className="text-sm text-muted-foreground hover:underline">
          ← Price tiers
        </Link>
        <PageHeader title="New price tier" />
      </div>
      <TierForm tiers={tiers} />
    </div>
  );
}
