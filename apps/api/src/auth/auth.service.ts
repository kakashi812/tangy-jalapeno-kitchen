import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ALL_PERMISSIONS,
  ErrorCode,
  isPermission,
  type LoginInput,
  type SessionUser,
} from '@fernleaf/shared';
import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashPassword, verifyPassword } from './password.js';

type UserWithRole = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  isActive: boolean;
  role: { id: string; name: string; isSystem: boolean; permissions: string[] };
};

type TokenPayload = { sub: string };

/** Compared against when the email is unknown, so a wrong email takes as long as a wrong password. */
const UNKNOWN_USER_HASH = hashPassword('not-a-real-password');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Checks credentials and returns the user plus a signed session token. Unknown email, wrong
   * password and deactivated account all give the same answer, so the response never reveals which
   * emails have accounts.
   */
  async login(input: LoginInput): Promise<{ user: SessionUser; token: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { role: true },
    });
    const passwordOk = await verifyPassword(
      input.password,
      user?.passwordHash ?? (await UNKNOWN_USER_HASH),
    );
    if (!user || !passwordOk || !user.isActive) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.InvalidCredentials,
        'Email or password is incorrect',
      );
    }
    const payload: TokenPayload = { sub: user.id };
    return { user: toSessionUser(user), token: await this.jwt.signAsync(payload) };
  }

  /**
   * Turns a session token back into the current user, or null if the token is missing, tampered
   * with or expired, or the account is gone or deactivated. The user and role are read from the
   * database on every request, so deactivation and role changes apply immediately.
   */
  async resolveSession(token: string | undefined): Promise<SessionUser | null> {
    if (!token) return null;
    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(token);
    } catch {
      return null;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });
    return user?.isActive ? toSessionUser(user) : null;
  }
}

function toSessionUser(user: UserWithRole): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: { id: user.role.id, name: user.role.name },
    // System roles (Admin) always hold every permission, including ones added later.
    // Stored names that no longer exist in code are ignored.
    permissions: user.role.isSystem ? ALL_PERMISSIONS : user.role.permissions.filter(isPermission),
  };
}
