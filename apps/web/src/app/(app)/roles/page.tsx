import type { Metadata } from 'next';
import Link from 'next/link';
import type { RoleDetail } from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Roles' };

export default async function RolesPage() {
  const user = await getSessionUser();
  if (!can(user, 'roles.manage')) return <NoAccess />;
  const roles = await apiGet<RoleDetail[]>('/roles');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles"
        description="A role is a named set of permissions. Each staff member has exactly one."
        actions={
          <Link href="/roles/new" className={buttonVariants()}>
            New role
          </Link>
        }
      />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Permissions</TableHead>
              <TableHead className="text-right">Staff</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id}>
                <TableCell>
                  <Link href={`/roles/${role.id}`} className="font-medium hover:underline">
                    {role.name}
                  </Link>{' '}
                  {role.isSystem ? <Badge variant="outline">Built-in</Badge> : null}
                </TableCell>
                <TableCell className="max-w-md text-muted-foreground">{role.description}</TableCell>
                <TableCell className="text-right">
                  {role.isSystem ? 'All' : role.permissions.length}
                </TableCell>
                <TableCell className="text-right">{role.staffCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
