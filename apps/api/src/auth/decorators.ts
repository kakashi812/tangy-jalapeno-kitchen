import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Permission, SessionUser } from '@fernleaf/shared';

/**
 * Every route must say who may call it. The AccessGuard rejects a route that uses none of these,
 * so forgetting to protect an endpoint fails closed instead of leaving it open.
 */
export const PUBLIC_KEY = 'access:public';
export const SIGNED_IN_KEY = 'access:signedIn';
export const PERMISSIONS_KEY = 'access:permissions';
export const ANY_PERMISSION_KEY = 'access:anyPermission';

/** Anyone, signed in or not (sign-in itself, health check). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Any signed-in staff member, whatever their role (e.g. "who am I"). */
export const SignedIn = () => SetMetadata(SIGNED_IN_KEY, true);

/** Signed in and holding every listed permission. */
export const RequirePermission = (...permissions: [Permission, ...Permission[]]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Signed in and holding at least one of the listed permissions. */
export const RequireAnyPermission = (...permissions: [Permission, Permission, ...Permission[]]) =>
  SetMetadata(ANY_PERMISSION_KEY, permissions);

/** The signed-in staff member, attached to the request by the AccessGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUser =>
    context.switchToHttp().getRequest<{ user: SessionUser }>().user,
);
