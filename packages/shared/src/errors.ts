import { z } from 'zod';

/**
 * Every API error has this shape, so the frontend handles errors one way everywhere.
 * - code: stable, machine-readable (the UI may branch on it)
 * - message: human-readable, safe to show
 * - fieldErrors: per-field messages keyed by field path ("lines.0.quantity"), for forms
 */
export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Generic codes. Modules add their own domain codes (e.g. CUTOFF_PASSED) as they are built. */
export const ErrorCode = {
  ValidationFailed: 'VALIDATION_FAILED',
  Unauthenticated: 'UNAUTHENTICATED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  Internal: 'INTERNAL',
  InvalidCredentials: 'INVALID_CREDENTIALS',
  /** Another request changed the same data at the same moment; retrying is safe. */
  ConcurrentUpdate: 'CONCURRENT_UPDATE',
  // Staff and roles (M1)
  LastAdmin: 'LAST_ADMIN',
  SelfLockout: 'SELF_LOCKOUT',
  SystemRoleLocked: 'SYSTEM_ROLE_LOCKED',
  RoleInUse: 'ROLE_IN_USE',
  // Settings and reference data (M2)
  ReferenceInUse: 'REFERENCE_IN_USE',
  // Catalogue (M3)
  OptionInUse: 'OPTION_IN_USE',
  // Pricing (M4)
  TierInUse: 'TIER_IN_USE',
  // Companies (M5)
  AddressInUse: 'ADDRESS_IN_USE',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Turns a Zod validation failure into the fieldErrors map. */
export function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : '_root';
    (fieldErrors[path] ??= []).push(issue.message);
  }
  return fieldErrors;
}
