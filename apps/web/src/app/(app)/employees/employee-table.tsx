import Link from 'next/link';
import { Clock, MapPin, Package } from 'lucide-react';
import type { EmployeeSummary } from '@fernleaf/shared';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/** Employees with their company, permission flags, allergies and diet at a glance. */
export function EmployeeTable({
  employees,
  showCompany,
}: {
  employees: EmployeeSummary[];
  showCompany: boolean;
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            {showCompany ? <TableHead>Company</TableHead> : null}
            <TableHead>May change</TableHead>
            <TableHead>Allergies</TableHead>
            <TableHead>Diet</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                No employees match.
              </TableCell>
            </TableRow>
          ) : (
            employees.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell>
                  <Link href={`/employees/${employee.id}`} className="font-medium hover:underline">
                    {employee.name}
                  </Link>{' '}
                  {employee.isOwner ? <Badge variant="secondary">Owner</Badge> : null}
                  <div className="text-xs text-muted-foreground">{employee.email}</div>
                </TableCell>
                {showCompany ? (
                  <TableCell>
                    <Link href={`/companies/${employee.company.id}`} className="hover:underline">
                      {employee.company.name}
                    </Link>
                  </TableCell>
                ) : null}
                <TableCell>
                  <span className="flex gap-2 text-muted-foreground">
                    {employee.canChooseAddress ? (
                      <MapPin className="size-4" aria-label="Address" />
                    ) : null}
                    {employee.canChangeDeliveryTime ? (
                      <Clock className="size-4" aria-label="Delivery time" />
                    ) : null}
                    {employee.canChangePackaging ? (
                      <Package className="size-4" aria-label="Packaging" />
                    ) : null}
                    {!employee.canChooseAddress &&
                    !employee.canChangeDeliveryTime &&
                    !employee.canChangePackaging
                      ? '—'
                      : null}
                  </span>
                </TableCell>
                <TableCell>
                  {employee.allergies.length > 0 ? (
                    <span className="flex flex-wrap gap-1">
                      {employee.allergies.map((a) => (
                        <Badge key={a.id} variant="destructive" className="font-normal">
                          {a.name}
                        </Badge>
                      ))}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {employee.dietaryPreferences.map((d) => d.name).join(', ') || '—'}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
