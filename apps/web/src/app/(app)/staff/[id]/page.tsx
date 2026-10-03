import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  formatKitchenDate,
  kitchenToday,
  type RoleDetail,
  type StaffMember,
} from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';
import { EditStaffForm } from '../staff-form';
import { ActivationToggle, ResetPasswordForm } from './account-actions';

export const metadata: Metadata = { title: 'Staff member' };

async function loadMember(id: string): Promise<StaffMember> {
  try {
    return await apiGet<StaffMember>(`/staff/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }
}

export default async function StaffMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!can(user, 'staff.read')) return <NoAccess />;

  const { id } = await params;
  const [member, roles] = await Promise.all([loadMember(id), apiGet<RoleDetail[]>('/roles')]);
  const canManage = can(user, 'staff.manage');
  const isSelf = member.id === user.id;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href="/staff" className="text-sm text-muted-foreground hover:underline">
          ← Staff
        </Link>
        <PageHeader
          title={member.name}
          description={`${member.email} · added ${formatKitchenDate(kitchenToday(new Date(member.createdAt)))}`}
          actions={
            member.isActive ? (
              <Badge variant="secondary">Active</Badge>
            ) : (
              <Badge variant="outline">Deactivated</Badge>
            )
          }
        />
      </div>

      {canManage ? (
        <>
          <section className="space-y-3">
            <h2 className="font-medium">Details</h2>
            <EditStaffForm member={member} roles={roles} isSelf={isSelf} />
          </section>
          <section className="space-y-3">
            <h2 className="font-medium">Password</h2>
            <ResetPasswordForm member={member} />
          </section>
          <section className="space-y-3">
            <h2 className="font-medium">Account</h2>
            <ActivationToggle member={member} isSelf={isSelf} />
          </section>
        </>
      ) : (
        <dl className="grid max-w-md grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Role</dt>
          <dd>{member.role.name}</dd>
        </dl>
      )}
    </div>
  );
}
