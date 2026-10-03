import type { Metadata } from 'next';
import Link from 'next/link';
import type { AdminMenuCategory } from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { CategoryList } from './category-list';

export const metadata: Metadata = { title: 'Menu' };

export default async function MenuPage() {
  const user = await getSessionUser();
  if (!can(user, 'menu.read')) return <NoAccess />;
  const categories = await apiGet<AdminMenuCategory[]>('/menu/categories');
  return (
    <div className="space-y-6">
      <PageHeader
        title="Menu"
        description="How dishes are presented to employees: categories in order. Companies can have categories or dishes hidden (on the company page). Dishes without a price on a company's tier are left out automatically."
        actions={
          <Link href="/menu/preview" className={buttonVariants({ variant: 'outline' })}>
            Preview as an employee
          </Link>
        }
      />
      <CategoryList categories={categories} canEdit={can(user, 'menu.manage')} />
    </div>
  );
}
