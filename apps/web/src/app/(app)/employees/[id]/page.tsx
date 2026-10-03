import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CompanySummary, EmployeeSummary, Paginated, ReferenceItem } from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { EmployeeForm } from '../employee-form';

export const metadata: Metadata = { title: 'Employee' };

async function loadEmployee(id: string) {
  try {
    return await apiGet<EmployeeSummary>(`/employees/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }
}

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!can(user, 'employees.read')) return <NoAccess />;
  const { id } = await params;
  const [employee, companies, allergens, dietaryTags] = await Promise.all([
    loadEmployee(id),
    apiGet<Paginated<CompanySummary>>('/companies?pageSize=100'),
    apiGet<ReferenceItem[]>('/reference/allergens?includeInactive=true'),
    apiGet<ReferenceItem[]>('/reference/dietary-tags?includeInactive=true'),
  ]);
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href={`/companies/${employee.company.id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {employee.company.name}
        </Link>
        <PageHeader
          title={employee.name}
          description={`${employee.email} · ${employee.company.name}`}
          actions={employee.isOwner ? <Badge variant="secondary">Company owner</Badge> : null}
        />
      </div>
      {can(user, 'employees.manage') ? (
        <EmployeeForm
          employee={employee}
          companies={companies.items}
          allergens={allergens}
          dietaryTags={dietaryTags}
        />
      ) : (
        <p className="text-sm text-muted-foreground">You can view but not edit employees.</p>
      )}
    </div>
  );
}
