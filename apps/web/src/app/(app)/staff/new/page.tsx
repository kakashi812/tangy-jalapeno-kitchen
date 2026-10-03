import type { Metadata } from 'next';
import Link from 'next/link';
import type { RoleDetail } from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { CreateStaffForm } from '../staff-form';

export const metadata: Metadata = { title: 'New staff member' };

export default async function NewStaffPage() {
  const user = await getSessionUser();
  if (!can(user, 'staff.manage')) return <NoAccess />;
  const roles = await apiGet<RoleDetail[]>('/roles');

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/staff" className="text-sm text-muted-foreground hover:underline">
          ← Staff
        </Link>
        <PageHeader title="New staff member" />
      </div>
      <CreateStaffForm roles={roles} />
    </div>
  );
}
