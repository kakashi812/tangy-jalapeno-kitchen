import { toApiRequestError } from './api-error';

type Method = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Sends a change (create, update, mark done…) from a client component. It goes through the /api
 * rewrite, so the browser sends the auth cookie automatically. After it succeeds, the caller runs
 * router.refresh() so the Server Components re-fetch and show the new state.
 *
 * Throws ApiRequestError on failure; forms read its fieldErrors.
 */
export async function apiSend<T = unknown>(
  method: Method,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw await toApiRequestError(response);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
