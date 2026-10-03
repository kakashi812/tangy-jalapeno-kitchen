import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Joins class names. clsx handles conditions (`isLate && 'text-red-600'`); tailwind-merge resolves
 * conflicting Tailwind classes so the last one wins (`cn('p-2', 'p-4')` → `'p-4'`).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
