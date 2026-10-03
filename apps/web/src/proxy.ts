import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@fernleaf/shared';

/**
 * Runs before every page request. If there is no session cookie at all, it sends the user straight
 * to the login page (remembering where they were going) instead of rendering a page that would
 * fail. It only checks that the cookie exists; whether the session is valid is decided by the API.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const login = new URL('/login', request.url);
  const target = request.nextUrl.pathname + request.nextUrl.search;
  if (target !== '/') login.searchParams.set('next', target);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the login page, API calls (/api is forwarded to Nest) and static files.
  matcher: ['/((?!login|api/|_next/|favicon\\.ico|.*\\.[a-z0-9]+$).*)'],
};
