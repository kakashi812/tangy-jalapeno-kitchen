import type { Metadata } from 'next';
import Link from 'next/link';
import type { DriverOption, ReferenceItem, TierSummary } from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { CompanyForm } from '../company-form';

export const metadata: Metadata = { title: 'New company' };

export default async function NewCompanyPage() {
  const user = await getSessionUser();
  if (!can(user, 'companies.manage')) return <NoAccess />;
  const [tiers, packagingTypes, drivers] = await Promise.all([
    apiGet<TierSummary[]>('/price-tiers'),
    apiGet<ReferenceItem[]>('/reference/packaging-types'),
    apiGet<DriverOption[]>('/companies/drivers'),
  ]);
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/companies" className="text-sm text-muted-foreground hover:underline">
          ← Companies
        </Link>
        <PageHeader
          title="New company"
          description="After creating it, add delivery addresses and employees."
        />
      </div>
      <CompanyForm tiers={tiers} packagingTypes={packagingTypes} drivers={drivers} />
    </div>
  );
}
