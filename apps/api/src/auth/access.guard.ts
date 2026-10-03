import { CanActivate, ExecutionContext, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ErrorCode, PERMISSIONS, type Permission, type SessionUser } from '@fernleaf/shared';
import { ApiException } from '../common/api-exception.js';
import { SESSION_COOKIE } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { ANY_PERMISSION_KEY, PERMISSIONS_KEY, PUBLIC_KEY, SIGNED_IN_KEY } from './decorators.js';

/**
 * Runs before every route in the app (registered globally). It answers two questions:
 * 1. Who is calling? (session cookie → user, loaded fresh from the database)
 * 2. May they call this route? (the route's declared permissions)
 * A route that declares nothing is refused: access is denied by default.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  private readonly logger = new Logger(AccessGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    const cookies = request.cookies as Record<string, string> | undefined;
    const user = await this.auth.resolveSession(cookies?.[SESSION_COOKIE]);
    if (!user) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.Unauthenticated,
        'Please sign in to continue',
      );
    }
    request.user = user;

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      targets,
    );
    if (required) {
      const missing = required.filter((permission) => !user.permissions.includes(permission));
      if (missing.length > 0) {
        throw new ApiException(
          HttpStatus.FORBIDDEN,
          ErrorCode.Forbidden,
          `You don't have permission to do this (${missing.map((p) => PERMISSIONS[p].label.toLowerCase()).join('; ')})`,
        );
      }
      return true;
    }

    const anyOf = this.reflector.getAllAndOverride<Permission[] | undefined>(
      ANY_PERMISSION_KEY,
      targets,
    );
    if (anyOf) {
      if (anyOf.some((permission) => user.permissions.includes(permission))) return true;
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        ErrorCode.Forbidden,
        `You don't have permission to do this (needs one of: ${anyOf.map((p) => PERMISSIONS[p].label.toLowerCase()).join('; ')})`,
      );
    }

    if (this.reflector.getAllAndOverride<boolean>(SIGNED_IN_KEY, targets)) return true;

    this.logger.error(
      `Route ${request.method} ${request.path} declares no access rule; refusing. Add @Public(), @SignedIn(), @RequirePermission() or @RequireAnyPermission().`,
    );
    throw new ApiException(HttpStatus.FORBIDDEN, ErrorCode.Forbidden, 'This action is not allowed');
  }
}
