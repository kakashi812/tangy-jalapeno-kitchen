import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { Permission, SessionUser } from '@fernleaf/shared';
import { ApiRequestError } from './api/api-error';
import { apiGet } from './api/server';

/**
 * The signed-in staff member, from GET /auth/me. Cached for the duration of one page render, so the
 * layout and the page can both call it without a second request. If the session is missing or
 * expired, the user is sent to the login page.
 */
export const getSessionUser = cache(async (): Promise<SessionUser> => {
  try {
    return await apiGet<SessionUser>('/auth/me');
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) redirect('/login');
    throw error;
  }
});

/**
 * For showing or hiding parts of the UI only. The API checks permissions on every request, so a
 * hidden button is a convenience, never the protection.
 */
export function can(user: SessionUser, permission: Permission): boolean {
  return user.permissions.includes(permission);
}
