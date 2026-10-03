'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  EMPLOYEE_CSV_COLUMNS,
  EMPLOYEE_CSV_TEMPLATE,
  type EmployeeImportResult,
  type EmployeeSummary,
} from '@fernleaf/shared';
import { FormError, selectClassName } from '@/components/form/field';
import { Button, buttonVariants } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiSend, apiUpload } from '@/lib/api/client';

/** Picks the company owner from its own employees. */
export function OwnerPicker({
  companyId,
  ownerId,
  employees,
}: {
  companyId: string;
  ownerId: string | null;
  employees: EmployeeSummary[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function change(employeeId: string) {
    setPending(true);
    setError(undefined);
    try {
      await apiSend('PUT', `/companies/${companyId}/owner`, { employeeId: employeeId || null });
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? (Object.values(err.fieldErrors)[0]?.[0] ?? err.message)
          : 'Could not reach the server.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1">
      <label htmlFor="owner" className="text-sm font-medium">
        Company owner
      </label>
      <select
        id="owner"
        className={`${selectClassName} max-w-sm`}
        defaultValue={ownerId ?? ''}
        disabled={pending || employees.length === 0}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">{employees.length === 0 ? 'Add employees first' : 'No owner yet'}</option>
        {employees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.name}
          </option>
        ))}
      </select>
      <FormError message={error} />
    </div>
  );
}

/**
 * CSV import: every row is checked on its own; good rows are added and each bad row is listed with
 * all its problems, so the file can be fixed and re-uploaded with only the failed rows.
 */
export function EmployeeImport({ companyId }: { companyId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<EmployeeImportResult>();
  const [error, setError] = useState<string>();

  async function upload(file: File) {
    setPending(true);
    setError(undefined);
    setResult(undefined);
    try {
      const outcome = await apiUpload<EmployeeImportResult>(
        `/companies/${companyId}/employees/import`,
        'file',
        file,
      );
      setResult(outcome);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? (Object.values(err.fieldErrors)[0]?.[0] ?? err.message)
          : 'Upload failed.',
      );
    } finally {
      setPending(false);
      if (input.current) input.current.value = '';
    }
  }

  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(EMPLOYEE_CSV_TEMPLATE)}`;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="space-y-1">
        <h3 className="font-medium">Import from CSV</h3>
        <p className="text-sm text-muted-foreground">
          Columns: <code className="text-xs">{EMPLOYEE_CSV_COLUMNS.join(', ')}</code>. Flags are
          yes/no; allergies and dietary preferences are names separated by semicolons. Emails must
          be on this company&apos;s domains.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          id="employee-csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button variant="outline" disabled={pending} onClick={() => input.current?.click()}>
          {pending ? 'Importing…' : 'Choose CSV file'}
        </Button>
        <a
          href={template}
          download="employees-template.csv"
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          Download template
        </a>
      </div>
      <FormError message={error} />
      {result ? (
        <div className="space-y-2 text-sm" role="status">
          <p>
            <span className="font-medium">{result.created} added</span>
            {result.errors.length > 0
              ? `, ${result.errors.length} row${result.errors.length === 1 ? '' : 's'} skipped:`
              : '.'}
          </p>
          {result.errors.length > 0 ? (
            <ul className="divide-y rounded-md border border-destructive/30 bg-destructive/5">
              {result.errors.map((rowError) => (
                <li key={rowError.row} className="px-3 py-2">
                  <span className="font-medium">Row {rowError.row}</span>
                  {rowError.email ? (
                    <span className="text-muted-foreground"> ({rowError.email})</span>
                  ) : null}
                  : {rowError.messages.join('; ')}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AddEmployeeLink({ companyId }: { companyId: string }) {
  return (
    <Link href={`/employees/new?companyId=${companyId}`} className={buttonVariants()}>
      Add employee
    </Link>
  );
}
