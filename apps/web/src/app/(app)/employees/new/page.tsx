import type { Metadata } from 'next';
import Link from 'next/link';
import type { CompanySummary, Paginated, ReferenceItem } from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { EmployeeForm } from '../employee-form';

export const metadata: Metadata = { title: 'Add employee' };

export default async function NewEmployeePage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const user = await getSessionUser();
  if (!can(user, 'employees.manage')) return <NoAccess />;
  const { companyId } = await searchParams;
  const [companies, allergens, dietaryTags] = await Promise.all([
    apiGet<Paginated<CompanySummary>>('/companies?pageSize=100'),
    apiGet<ReferenceItem[]>('/reference/allergens'),
    apiGet<ReferenceItem[]>('/reference/dietary-tags'),
  ]);
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href={companyId ? `/companies/${companyId}` : '/employees'}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back
        </Link>
        <PageHeader title="Add employee" />
      </div>
      <EmployeeForm
        companyId={companyId}
        companies={companies.items}
        allergens={allergens}
        dietaryTags={dietaryTags}
      />
    </div>
  );
}
