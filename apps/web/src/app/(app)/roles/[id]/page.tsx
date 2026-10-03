import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { RoleDetail } from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { DeleteRoleButton, PermissionSummary, RoleForm } from '../role-form';

export const metadata: Metadata = { title: 'Role' };

async function loadRole(id: string): Promise<RoleDetail> {
  try {
    return await apiGet<RoleDetail>(`/roles/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }
}

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!can(user, 'roles.manage')) return <NoAccess />;
  const role = await loadRole((await params).id);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href="/roles" className="text-sm text-muted-foreground hover:underline">
          ← Roles
        </Link>
        <PageHeader
          title={role.name}
          description={`${role.staffCount} staff member${role.staffCount === 1 ? '' : 's'}`}
          actions={role.isSystem ? <Badge variant="outline">Built-in</Badge> : null}
        />
      </div>

      {role.isSystem ? (
        <section className="space-y-4">
          <p className="max-w-2xl text-sm text-muted-foreground">
            This role is built in and can&apos;t be edited or deleted. It always has every
            permission, including ones added in future, so the panel can never be left without
            someone who can manage it.
          </p>
          <PermissionSummary permissions={role.permissions} />
        </section>
      ) : (
        <>
          <RoleForm role={role} />
          <section className="space-y-3 border-t pt-6">
            <h2 className="font-medium">Delete</h2>
            <DeleteRoleButton role={role} />
          </section>
        </>
      )}
    </div>
  );
}
