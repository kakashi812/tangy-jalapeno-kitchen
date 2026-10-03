import { z } from 'zod';
import { formatCents, parseDollars } from '@fernleaf/shared';

/**
 * Money is typed as dollars ("3.10") and sent as integer cents (310). The text is parsed without
 * floating point (parseDollars), so 0.29 stays 29 cents.
 */
export const DollarInputSchema = z
  .string()
  .trim()
  .regex(/^\d{1,5}(\.\d{1,2})?$/, 'Enter an amount like 3.10');

export const dollarsToCents = (value: string) => parseDollars(value);

/** 310 → "3.10" (no currency sign, for an input's value). */
export const centsToDollarInput = (cents: number) => formatCents(cents).replace(/[$,]/g, '');
