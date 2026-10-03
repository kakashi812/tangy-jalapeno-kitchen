import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  formatTimeOfDay,
  kitchenToday,
  type CompanyDetail,
  type DriverOption,
  type EmployeeSummary,
  type Paginated,
  type ReferenceItem,
  type TierSummary,
} from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { CompanyForm } from '../company-form';
import { Addresses } from './addresses';
import { CompanyHolidays } from './company-holidays';
import { AddEmployeeLink, EmployeeImport, OwnerPicker } from './company-employees';
import { EmployeeTable } from '../../employees/employee-table';

export const metadata: Metadata = { title: 'Company' };

async function loadCompany(id: string) {
  try {
    return await apiGet<CompanyDetail>(`/companies/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }
}

/** Read-only summary for staff who can see companies but not edit them (e.g. dispatch). */
function CompanySummaryView({ company }: { company: CompanyDetail }) {
  const rows: [string, string][] = [
    ['Email domains', company.domains.map((d) => `@${d}`).join(', ')],
    [
      'Default delivery',
      `${formatTimeOfDay(company.defaultDeliveryTimeMinutes)}, leaves the kitchen ${company.dispatchLeadMinutes} min before`,
    ],
    ['Packaging', company.defaultPackagingType.name],
    [
      'Default driver',
      company.defaultDriver
        ? `${company.defaultDriver.name}${company.defaultDriver.isActive ? '' : ' (deactivated)'}`
        : 'None',
    ],
    ['Driver instructions', company.driverInstructions || '—'],
    ['Billing contact', `${company.billingContactName}, ${company.billingEmail}`],
  ];
  return (
    <dl className="grid max-w-3xl grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!can(user, 'companies.read')) return <NoAccess />;
  const canEdit = can(user, 'companies.manage');
  const { id } = await params;
  const [company, tiers, packagingTypes, drivers] = await Promise.all([
    loadCompany(id),
    canEdit ? apiGet<TierSummary[]>('/price-tiers') : Promise.resolve([]),
    canEdit
      ? apiGet<ReferenceItem[]>('/reference/packaging-types?includeInactive=true')
      : Promise.resolve([]),
    canEdit ? apiGet<DriverOption[]>('/companies/drivers') : Promise.resolve([]),
  ]);
  const canSeeEmployees = can(user, 'employees.read');
  const employees = canSeeEmployees
    ? await apiGet<Paginated<EmployeeSummary>>(`/employees?companyId=${id}&pageSize=100`)
    : null;

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <Link href="/companies" className="text-sm text-muted-foreground hover:underline">
          ← Companies
        </Link>
        <PageHeader
          title={company.name}
          description={`${company.priceTier ? `${company.priceTier.name} prices${company.priceTier.viaDefault ? ' (default tier)' : ''}` : 'No price tier'} · ${company.employeeCount} employees`}
          actions={!company.isActive ? <Badge variant="outline">Inactive</Badge> : null}
        />
      </div>

      {canEdit ? (
        <CompanyForm
          company={company}
          tiers={tiers}
          packagingTypes={packagingTypes}
          drivers={drivers}
        />
      ) : (
        <CompanySummaryView company={company} />
      )}

      {employees ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <h2 className="font-heading text-lg font-bold">Employees ({employees.total})</h2>
              <p className="text-sm text-muted-foreground">
                People meals are ordered for. The owner is one of them.
              </p>
            </div>
            {can(user, 'employees.manage') ? <AddEmployeeLink companyId={company.id} /> : null}
          </div>
          {canEdit ? (
            <OwnerPicker
              companyId={company.id}
              ownerId={company.owner?.id ?? null}
              employees={employees.items}
            />
          ) : null}
          <EmployeeTable employees={employees.items} showCompany={false} />
          {employees.total > employees.items.length ? (
            <Link href={`/employees?companyId=${company.id}`} className="text-sm hover:underline">
              See all {employees.total} employees →
            </Link>
          ) : null}
          {can(user, 'employees.manage') ? <EmployeeImport companyId={company.id} /> : null}
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-bold">Delivery addresses</h2>
          <p className="text-sm text-muted-foreground">
            Employees allowed to choose their address pick from these.
          </p>
        </div>
        <Addresses companyId={company.id} addresses={company.addresses} canEdit={canEdit} />
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-bold">Company holidays</h2>
          <p className="text-sm text-muted-foreground">
            No deliveries on these days. They don&apos;t move the order cut-off (only kitchen
            closures do).
          </p>
        </div>
        <CompanyHolidays
          companyId={company.id}
          holidays={company.holidays}
          today={kitchenToday()}
          canEdit={canEdit}
        />
      </section>
    </div>
  );
}
