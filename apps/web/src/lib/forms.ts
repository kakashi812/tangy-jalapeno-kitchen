import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiRequestError } from './api/api-error';

/**
 * Shows an API error on a react-hook-form form: each fieldErrors entry appears under its input;
 * anything else becomes a message at the top of the form (errors.root.server).
 */
export function showServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
) {
  if (error instanceof ApiRequestError) {
    const fields = Object.entries(error.fieldErrors);
    for (const [field, messages] of fields) {
      setError(field as Path<T>, { type: 'server', message: messages.join(' ') });
    }
    if (fields.length === 0) setError('root.server', { type: 'server', message: error.message });
    return;
  }
  setError('root.server', {
    type: 'server',
    message: 'Could not reach the server. Check your connection and try again.',
  });
}

/** Only allow redirects to paths on this site ("/orders"), never to another site ("//evil.com"). */
export function safeNextPath(next: string | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}
