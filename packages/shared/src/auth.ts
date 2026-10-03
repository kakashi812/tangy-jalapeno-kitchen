import { z } from 'zod';
import { PermissionSchema } from './permissions.js';

/** Name of the httpOnly cookie that carries the session token (set by the API, checked by the web proxy). */
export const SESSION_COOKIE = 'fl_session';

/** Emails are trimmed and lowercased everywhere, matching the database's lowercase rule. */
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof LoginSchema>;

/** The signed-in staff member, as returned by POST /auth/login and GET /auth/me. */
export const SessionUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: z.object({ id: z.uuid(), name: z.string() }),
  permissions: z.array(PermissionSchema),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;
