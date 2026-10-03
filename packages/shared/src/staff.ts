import { z } from 'zod';
import { EmailSchema } from './auth.js';
import { PageQuerySchema } from './pagination.js';
import { PermissionSchema } from './permissions.js';

// ─── Staff ──────────────────────────────────────────────────────────────────────────────────

/** bcrypt only reads the first 72 bytes, so longer passwords are refused rather than silently cut. */
export const NewPasswordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters');

const StaffNameSchema = z.string().trim().min(1, 'Enter a name').max(100, 'Name is too long');

export const StaffListQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  roleId: z.uuid().optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
});
export type StaffListQuery = z.infer<typeof StaffListQuerySchema>;

export const CreateStaffSchema = z.object({
  email: EmailSchema,
  name: StaffNameSchema,
  roleId: z.uuid('Choose a role'),
  password: NewPasswordSchema,
});
export type CreateStaffInput = z.infer<typeof CreateStaffSchema>;

/** Deactivating is `isActive: false`; staff are never deleted. */
export const UpdateStaffSchema = z
  .object({
    name: StaffNameSchema,
    roleId: z.uuid('Choose a role'),
    isActive: z.boolean(),
  })
  .partial();
export type UpdateStaffInput = z.infer<typeof UpdateStaffSchema>;

export const ResetPasswordSchema = z.object({ password: NewPasswordSchema });
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

export type StaffMember = {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  role: { id: string; name: string; isSystem: boolean };
  createdAt: string;
};

// ─── Roles ──────────────────────────────────────────────────────────────────────────────────

export const RoleInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter a role name').max(50, 'Name is too long'),
  description: z.string().trim().max(200, 'Description is too long').default(''),
  permissions: z
    .array(PermissionSchema)
    .refine((list) => new Set(list).size === list.length, 'A permission is listed twice'),
});
export type RoleInput = z.input<typeof RoleInputSchema>;

export type RoleDetail = {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: z.infer<typeof PermissionSchema>[];
  staffCount: number;
};
