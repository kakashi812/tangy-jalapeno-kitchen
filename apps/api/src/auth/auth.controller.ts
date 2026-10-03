import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { LoginSchema, type LoginInput, type SessionUser } from '@fernleaf/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { loadEnv } from '../config/env.js';
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { CurrentUser, Public, SignedIn } from './decorators.js';

/**
 * httpOnly: page scripts can't read the token, so an injected script can't steal it.
 * sameSite lax: the browser doesn't send it on cross-site form posts (CSRF protection).
 * secure in production: only sent over HTTPS.
 */
function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: loadEnv().NODE_ENV === 'production',
    path: '/',
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) body: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionUser> {
    const { user, token } = await this.auth.login(body);
    response.cookie(SESSION_COOKIE, token, {
      ...sessionCookieOptions(),
      maxAge: SESSION_TTL_SECONDS * 1000,
    });
    return user;
  }

  /** Public so that signing out works even when the session has already expired. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  }

  @SignedIn()
  @Get('me')
  me(@CurrentUser() user: SessionUser): SessionUser {
    return user;
  }
}
