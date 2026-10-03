import { cookies } from 'next/headers';
import { toApiRequestError } from './api-error';

/**
 * Calls the NestJS API from Server Components (page data, streamed with Suspense).
 *
 * Server Components run on the Next.js server, not in the browser, so they call the API directly
 * at API_URL instead of going through the /api rewrite, and they forward the user's cookies so the
 * API knows who is asking. Never import this from a client component: `next/headers` only works on
 * the server, so such an import fails the build.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) throw new Error('API_URL is not set');

  const cookieHeader = (await cookies()).toString();
  const response = await fetch(`${apiUrl}${path}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    cache: 'no-store', // always fresh: orders and boards change constantly
  });
  if (!response.ok) throw await toApiRequestError(response);
  return (await response.json()) as T;
}
