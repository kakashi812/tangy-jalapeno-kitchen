import { z } from 'zod';
import { IsoDateSchema } from './calendar.js';
import { PageQuerySchema } from './pagination.js';

// ─── Email domains ──────────────────────────────────────────────────────────────────────────

/**
 * Consumer email providers. A company can't claim these (brief 4.4): they would match people from
 * every company. Kept in code (decision 26): it rarely changes.
 */
export const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.in',
  'yahoo.co.uk',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'yandex.com',
  'rediffmail.com',
  'fastmail.com',
  'hey.com',
]);

const DOMAIN_PATTERN = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** "@Acme.COM " → "acme.com"; rejects malformed and public domains. */
export const EmailDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((domain) => domain.replace(/^@/, ''))
  .pipe(
    z
      .string()
      .regex(DOMAIN_PATTERN, 'Enter a domain like acme.com')
      .refine(
        (domain) => !PUBLIC_EMAIL_DOMAINS.has(domain),
        'Public email domains (like gmail.com) can’t be claimed by a company',
      ),
  );

/** The domain part of an email address, lowercased. */
export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split('@').pop() ?? '';
}

// ─── Company ────────────────────────────────────────────────────────────────────────────────

const WorkingDaysSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1, 'Pick at least one working day')
  .refine((days) => new Set(days).size === days.length, 'A day is listed twice');

/** Delivery times are wall-clock kitchen minutes in 15-minute steps (decision 28). */
export const DeliveryTimeSchema = z
  .number()
  .int()
  .min(0)
  .max(1439)
  .refine((minutes) => minutes % 15 === 0, 'Use a time on the quarter hour (e.g. 12:30)');

export const CompanyInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(100, 'Name is too long'),
  isActive: z.boolean(),
  domains: z
    .array(EmailDomainSchema)
    .min(1, 'Add at least one email domain')
    .max(10, 'At most 10 domains')
    .refine((list) => new Set(list).size === list.length, 'A domain is listed twice'),
  /** Null = the default tier. */
  priceTierId: z.uuid().nullable(),
  billingContactName: z.string().trim().min(1, 'Enter a billing contact').max(100),
  billingEmail: z.email('Enter a valid email'),
  billingPhone: z.string().trim().max(30).default(''),
  workingDays: WorkingDaysSchema,
  defaultDeliveryTimeMinutes: DeliveryTimeSchema,
  /** How many minutes before delivery the order must leave the kitchen (brief default 60). */
  dispatchLeadMinutes: z.number().int().min(0).max(480, 'At most 8 hours'),
  defaultPackagingTypeId: z.uuid('Choose a packaging type'),
  driverInstructions: z.string().trim().max(500, 'Too long').default(''),
  /** Null = no default driver: drops start unassigned. */
  defaultDriverId: z.uuid().nullable(),
});
export type CompanyInput = z.input<typeof CompanyInputSchema>;

export const CompanyListQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  priceTierId: z.uuid().optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
});
export type CompanyListQuery = z.infer<typeof CompanyListQuerySchema>;

export type CompanySummary = {
  id: string;
  name: string;
  isActive: boolean;
  domains: string[];
  /** The tier the company's prices come from; isDefault when it has no tier of its own. */
  priceTier: { id: string; name: string; viaDefault: boolean } | null;
  addressCount: number;
  employeeCount: number;
};

export type CompanyAddress = {
  id: string;
  label: string;
  line1: string;
  line2: string;
  city: string;
  postcode: string;
  deliveryNotes: string;
  isDefault: boolean;
};

export type CompanyHoliday = { id: string; name: string; startDate: string; endDate: string };

export type CompanyDetail = Omit<CompanySummary, 'priceTier'> & {
  priceTierId: string | null;
  priceTier: CompanySummary['priceTier'];
  billingContactName: string;
  billingEmail: string;
  billingPhone: string;
  workingDays: number[];
  defaultDeliveryTimeMinutes: number;
  dispatchLeadMinutes: number;
  defaultPackagingType: { id: string; name: string; isActive: boolean };
  driverInstructions: string;
  /** isActive false = the default driver was deactivated (decision 30: shown with a warning). */
  defaultDriver: { id: string; name: string; isActive: boolean } | null;
  owner: { id: string; name: string; email: string } | null;
  addresses: CompanyAddress[];
  holidays: CompanyHoliday[];
};

// ─── Addresses and holidays ─────────────────────────────────────────────────────────────────

export const AddressInputSchema = z.object({
  label: z.string().trim().min(1, 'Give the address a short label, e.g. "HQ reception"').max(60),
  line1: z.string().trim().min(1, 'Enter the street address').max(120),
  line2: z.string().trim().max(120).default(''),
  city: z.string().trim().min(1, 'Enter the city').max(60),
  postcode: z.string().trim().min(3, 'Enter the postcode').max(12),
  deliveryNotes: z.string().trim().max(300).default(''),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.input<typeof AddressInputSchema>;

export const CompanyHolidayInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name').max(80),
    startDate: IsoDateSchema,
    endDate: IsoDateSchema,
  })
  .refine((h) => h.endDate >= h.startDate, {
    path: ['endDate'],
    message: 'The end date must be on or after the start date',
  });
export type CompanyHolidayInput = z.infer<typeof CompanyHolidayInputSchema>;

/** A staff member who can be given deliveries (has deliveries.own). */
export type DriverOption = { id: string; name: string; email: string };
