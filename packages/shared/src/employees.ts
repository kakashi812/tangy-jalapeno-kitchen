import { z } from 'zod';
import { EmailSchema } from './auth.js';
import { emailDomain } from './companies.js';
import { PageQuerySchema } from './pagination.js';

const IdListSchema = z
  .array(z.uuid())
  .refine((ids) => new Set(ids).size === ids.length, 'An item is listed twice');

/**
 * A company employee: the people meals are ordered for. They never sign in. Their flags say what
 * staff may change on their behalf when ordering (brief 4.5).
 */
export const EmployeeInputSchema = z.object({
  companyId: z.uuid('Choose a company'),
  name: z.string().trim().min(1, 'Enter a name').max(100, 'Name is too long'),
  email: EmailSchema,
  phone: z.string().trim().max(30).default(''),
  canChooseAddress: z.boolean(),
  canChangeDeliveryTime: z.boolean(),
  canChangePackaging: z.boolean(),
  allergenIds: IdListSchema,
  dietaryTagIds: IdListSchema,
});
export type EmployeeInput = z.input<typeof EmployeeInputSchema>;

export const EmployeeListQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  companyId: z.uuid().optional(),
});
export type EmployeeListQuery = z.infer<typeof EmployeeListQuerySchema>;

type NamedRef = { id: string; name: string };

export type EmployeeSummary = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: NamedRef;
  isOwner: boolean;
  canChooseAddress: boolean;
  canChangeDeliveryTime: boolean;
  canChangePackaging: boolean;
  allergies: NamedRef[];
  dietaryPreferences: NamedRef[];
};

export const SetOwnerSchema = z.object({ employeeId: z.uuid().nullable() });
export type SetOwnerInput = z.infer<typeof SetOwnerSchema>;

// ─── CSV import ─────────────────────────────────────────────────────────────────────────────

/** Expected header row. Lists (allergies, dietary preferences) are separated by semicolons. */
export const EMPLOYEE_CSV_COLUMNS = [
  'name',
  'email',
  'phone',
  'can_choose_address',
  'can_change_delivery_time',
  'can_change_packaging',
  'allergies',
  'dietary_preferences',
] as const;

export const EMPLOYEE_CSV_TEMPLATE = `${EMPLOYEE_CSV_COLUMNS.join(',')}
Priya Sharma,priya.sharma@acme.com,+91 98450 00001,yes,no,no,Milk;Peanuts,Vegetarian
Arjun Mehta,arjun.mehta@acme.com,,no,no,yes,,Vegan;Gluten-free
`;

export const MAX_IMPORT_ROWS = 1000;

export type ImportRowError = { row: number; email: string; messages: string[] };
export type EmployeeImportResult = { created: number; errors: ImportRowError[] };

const YES = new Set(['yes', 'y', 'true', '1']);
const NO = new Set(['no', 'n', 'false', '0', '']);

export type ImportContext = {
  companyId: string;
  companyDomains: string[];
  /** Lowercased name → id, for active items. */
  allergenIds: Map<string, string>;
  dietaryTagIds: Map<string, string>;
  /** Emails already in the database (any company), lowercased. */
  existingEmails: Set<string>;
};

/**
 * Checks one CSV row and turns it into an EmployeeInput, or explains everything wrong with it.
 * Pure (no database), so the import rules are unit-tested. `seenEmails` catches duplicates within
 * the same file; the caller adds each accepted email to it.
 */
export function checkEmployeeRow(
  cells: Record<string, string>,
  context: ImportContext,
  seenEmails: Set<string>,
): { ok: true; input: z.output<typeof EmployeeInputSchema> } | { ok: false; messages: string[] } {
  const messages: string[] = [];
  const flag = (column: string): boolean => {
    const value = (cells[column] ?? '').trim().toLowerCase();
    if (YES.has(value)) return true;
    if (!NO.has(value)) messages.push(`${column} must be yes or no (got "${cells[column]}")`);
    return false;
  };
  const list = (column: string, lookup: Map<string, string>, label: string): string[] =>
    (cells[column] ?? '')
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .flatMap((name) => {
        const id = lookup.get(name.toLowerCase());
        if (!id) messages.push(`Unknown ${label} "${name}"`);
        return id ? [id] : [];
      });

  const candidate = {
    companyId: context.companyId,
    name: cells.name ?? '',
    email: cells.email ?? '',
    phone: cells.phone ?? '',
    canChooseAddress: flag('can_choose_address'),
    canChangeDeliveryTime: flag('can_change_delivery_time'),
    canChangePackaging: flag('can_change_packaging'),
    allergenIds: [...new Set(list('allergies', context.allergenIds, 'allergen'))],
    dietaryTagIds: [
      ...new Set(list('dietary_preferences', context.dietaryTagIds, 'dietary preference')),
    ],
  };
  const parsed = EmployeeInputSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues)
      messages.push(`${issue.path.join('.')}: ${issue.message}`);
  } else {
    const email = parsed.data.email;
    if (!context.companyDomains.includes(emailDomain(email))) {
      messages.push(`email must be on ${context.companyDomains.map((d) => `@${d}`).join(' or ')}`);
    }
    if (context.existingEmails.has(email))
      messages.push('an employee with this email already exists');
    else if (seenEmails.has(email)) messages.push('this email appears earlier in the file');
  }
  return messages.length > 0 || !parsed.success
    ? { ok: false, messages }
    : { ok: true, input: parsed.data };
}
