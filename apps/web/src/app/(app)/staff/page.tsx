import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  StaffListQuerySchema,
  type Paginated,
  type RoleDetail,
  type StaffListQuery,
  type StaffMember,
} from '@fernleaf/shared';
import { selectClassName } from '@/components/form/field';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

export const metadata: Metadata = { title: 'Staff' };

type SearchParams = Record<string, string | undefined>;

/** Turns the parsed query back into URL params for the API call and the pagination links. */
function toParams(query: StaffListQuery): SearchParams {
  return {
    q: query.q || undefined,
    roleId: query.roleId,
    status: query.status === 'active' ? undefined : query.status,
    page: query.page > 1 ? String(query.page) : undefined,
  };
}

async function StaffTable({ query }: { query: StaffListQuery }) {
  const params = new URLSearchParams({
    ...Object.fromEntries(Object.entries(toParams(query)).filter(([, v]) => v !== undefined)),
    status: query.status,
    pageSize: String(query.pageSize),
  } as Record<string, string>);
  const result = await apiGet<Paginated<StaffMember>>(`/staff?${params}`);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No staff match these filters.
                </TableCell>
              </TableRow>
            ) : (
              result.items.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <Link href={`/staff/${member.id}`} className="font-medium hover:underline">
                      {member.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{member.email}</TableCell>
                  <TableCell>{member.role.name}</TableCell>
                  <TableCell>
                    {member.isActive ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : (
                      <Badge variant="outline">Deactivated</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Pagination
        pathname="/staff"
        params={toParams(query)}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </div>
  );
}

function TableSkeleton() {
  return <div className="h-64 animate-pulse rounded-lg bg-muted" aria-busy="true" />;
}

export default async function StaffPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getSessionUser();
  if (!can(user, 'staff.read')) return <NoAccess />;

  // Bad values in the URL fall back to the defaults instead of breaking the page.
  const parsed = StaffListQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : StaffListQuerySchema.parse({});
  const roles = await apiGet<RoleDetail[]>('/roles');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        description="People who sign in to this panel. Each has exactly one role."
        actions={
          can(user, 'staff.manage') ? (
            <Link href="/staff/new" className={buttonVariants()}>
              New staff member
            </Link>
          ) : null
        }
      />

      {/* A plain GET form: filters go into the URL, so no JavaScript is needed to search. */}
      <form className="flex flex-wrap items-end gap-3" action="/staff">
        <Input
          name="q"
          defaultValue={query.q}
          placeholder="Search name or email"
          className="w-64"
          aria-label="Search name or email"
        />
        <select
          name="roleId"
          defaultValue={query.roleId ?? ''}
          className={`${selectClassName} w-40`}
          aria-label="Role"
        >
          <option value="">All roles</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={query.status}
          className={`${selectClassName} w-40`}
          aria-label="Status"
        >
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
          <option value="all">All</option>
        </select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      <Suspense key={JSON.stringify(query)} fallback={<TableSkeleton />}>
        <StaffTable query={query} />
      </Suspense>
    </div>
  );
}
