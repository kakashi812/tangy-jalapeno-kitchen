import type { Metadata } from 'next';
import Link from 'next/link';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { can, getSessionUser } from '@/lib/session';
import { RoleForm } from '../role-form';

export const metadata: Metadata = { title: 'New role' };

export default async function NewRolePage() {
  const user = await getSessionUser();
  if (!can(user, 'roles.manage')) return <NoAccess />;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/roles" className="text-sm text-muted-foreground hover:underline">
          ← Roles
        </Link>
        <PageHeader
          title="New role"
          description="Pick only what this job needs. You can change it later."
        />
      </div>
      <RoleForm />
    </div>
  );
}
