import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { KeyRound } from 'lucide-react';
import {
  ErrorCode,
  type EmployeeMenu,
  type EmployeeSummary,
  type Paginated,
} from '@fernleaf/shared';
import { FilterBar, FilterSelect } from '@/components/filter-bar';
import { FormError } from '@/components/form/field';
import { MenuDishCard } from '@/components/menu/menu-dish-card';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { SecretButton } from './secret-button';

export const metadata: Metadata = { title: 'Menu preview' };

async function loadMenu(
  employeeId: string,
  code?: string,
): Promise<{ menu: EmployeeMenu; codeError?: string }> {
  const base = `/menu/preview?employeeId=${employeeId}`;
  if (!code) return { menu: await apiGet<EmployeeMenu>(base) };
  try {
    return { menu: await apiGet<EmployeeMenu>(`${base}&code=${encodeURIComponent(code)}`) };
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === ErrorCode.SecretNotFound) {
      return { menu: await apiGet<EmployeeMenu>(base), codeError: error.message };
    }
    throw error;
  }
}

async function EmployeeMenuView({ employeeId, code }: { employeeId: string; code?: string }) {
  const { menu, codeError } = await loadMenu(employeeId, code);
  const dishCount = menu.categories.reduce((n, c) => n + c.dishes.length, 0);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border bg-muted/30 p-4">
        <div className="space-y-1 text-sm">
          <div className="font-heading text-lg font-bold">{menu.employee.name}</div>
          <div className="text-muted-foreground">
            {menu.company.name} ·{' '}
            <span className="font-medium text-foreground">{menu.tier.name}</span> prices ·{' '}
            {dishCount} dish{dishCount === 1 ? '' : 'es'} available
          </div>
          <div className="flex flex-wrap gap-1 pt-1">
            {menu.employee.allergies.map((a) => (
              <Badge key={a.id} variant="destructive">
                Allergic: {a.name}
              </Badge>
            ))}
            {menu.employee.dietaryPreferences.map((d) => (
              <Badge key={d.id} variant="secondary">
                Diet: {d.name}
              </Badge>
            ))}
          </div>
        </div>
        <SecretButton employeeId={menu.employee.id} />
      </div>
      <FormError message={codeError} />
      {menu.unlockedCategory ? (
        <p className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="size-4" aria-hidden /> Showing the secret category &quot;
          {menu.unlockedCategory}&quot;.{' '}
          <Link
            href={`/menu/preview?employeeId=${menu.employee.id}`}
            className="font-normal underline"
          >
            Hide it
          </Link>
        </p>
      ) : null}
      {menu.categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing on the menu for this employee.</p>
      ) : (
        menu.categories.map((category) => (
          <section key={category.id} className="space-y-3">
            <h2 className="flex items-center gap-2 font-heading text-xl font-bold">
              {category.name}
              {category.isSecret ? (
                <Badge variant="secondary">
                  <KeyRound className="size-3" aria-hidden /> Secret
                </Badge>
              ) : null}
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {category.dishes.map((dish) => (
                <li key={dish.menuItemId} className="flex">
                  <MenuDishCard dish={dish} employeeName={menu.employee.name} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

export default async function MenuPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ employeeId?: string; code?: string }>;
}) {
  const user = await getSessionUser();
  if (!can(user, 'menu.read') || !can(user, 'employees.read')) return <NoAccess />;
  const { employeeId, code } = await searchParams;
  // Up to 100 employees, grouped by company; a search box would replace this for larger client lists.
  const employees = await apiGet<Paginated<EmployeeSummary>>('/employees?pageSize=100');
  const byCompany = new Map<string, EmployeeSummary[]>();
  for (const employee of employees.items) {
    byCompany.set(employee.company.name, [
      ...(byCompany.get(employee.company.name) ?? []),
      employee,
    ]);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/menu" className="text-sm text-muted-foreground hover:underline">
          ← Menu
        </Link>
        <PageHeader
          title="Preview as an employee"
          description="Exactly what this employee would see: their company's hidden categories and dishes removed, their price tier applied, and dishes without a price left out. Allergies and diet are flagged, not hidden."
        />
      </div>
      <FilterBar action="/menu/preview" active={Boolean(employeeId)}>
        <FilterSelect
          name="employeeId"
          defaultValue={employeeId ?? ''}
          aria-label="Employee"
          className="min-w-72"
        >
          <option value="">Choose an employee…</option>
          {[...byCompany.entries()].map(([company, people]) => (
            <optgroup key={company} label={company}>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </optgroup>
          ))}
        </FilterSelect>
      </FilterBar>
      {employeeId ? (
        <Suspense
          key={`${employeeId}:${code}`}
          fallback={<div className="h-96 animate-pulse rounded-lg bg-muted" aria-busy />}
        >
          <EmployeeMenuView employeeId={employeeId} code={code} />
        </Suspense>
      ) : (
        <p className="text-sm text-muted-foreground">Choose an employee to see their menu.</p>
      )}
    </div>
  );
}
