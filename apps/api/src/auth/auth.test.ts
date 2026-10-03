import 'reflect-metadata';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiErrorSchema, SessionUserSchema } from '@fernleaf/shared';
import { configureApp } from '../app.setup.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthModule } from './auth.module.js';
import { SESSION_COOKIE } from './auth.constants.js';
import { Public, RequireAnyPermission, RequirePermission, SignedIn } from './decorators.js';
import { hashPassword } from './password.js';

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

const ADMIN_ROLE = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Admin',
  isSystem: true,
  permissions: [], // system role: gets every permission regardless of what is stored
};
const KITCHEN_ROLE = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Kitchen',
  isSystem: false,
  permissions: ['kitchen.view', 'orders.read', 'removed.permission'],
};

type FakeUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  isActive: boolean;
  role: typeof ADMIN_ROLE | typeof KITCHEN_ROLE;
};
let users: FakeUser[] = [];

/** Stands in for Prisma: the two lookups the auth code makes, served from memory. */
const fakePrisma = {
  user: {
    findUnique: async ({ where }: { where: { email?: string; id?: string } }) =>
      users.find((u) => (where.email ? u.email === where.email : u.id === where.id)) ?? null,
  },
};

/** Routes that exist only in this test, one per kind of access rule. */
@Controller('probe')
class ProbeController {
  @Public() @Get('public') open() {
    return { ok: true };
  }
  @SignedIn() @Get('signed-in') signedIn() {
    return { ok: true };
  }
  @RequirePermission('kitchen.view') @Get('kitchen') kitchen() {
    return { ok: true };
  }
  @RequirePermission('orders.override') @Get('override') override() {
    return { ok: true };
  }
  @RequireAnyPermission('orders.override', 'kitchen.view') @Get('any') any() {
    return { ok: true };
  }
  @RequireAnyPermission('orders.override', 'billing.manage') @Get('any-missing') anyMissing() {
    return { ok: true };
  }
  @Get('forgotten') forgotten() {
    return { ok: true };
  }
}

describe('auth and access control', () => {
  let app: INestApplication;
  let baseUrl: string;
  let jwt: JwtService;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hashPassword('Test@1234');
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule],
      controllers: [ProbeController],
    })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    users = [
      {
        id: '10000000-0000-4000-8000-000000000001',
        email: 'admin@test.com',
        name: 'Asha',
        passwordHash,
        isActive: true,
        role: ADMIN_ROLE,
      },
      {
        id: '10000000-0000-4000-8000-000000000002',
        email: 'kitchen@test.com',
        name: 'Karan',
        passwordHash,
        isActive: true,
        role: KITCHEN_ROLE,
      },
    ];
  });

  const login = (email: string, password: string) =>
    fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

  /** Signs in and returns the cookie header to send on later requests. */
  async function sessionCookie(email: string): Promise<string> {
    const res = await login(email, 'Test@1234');
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    return setCookie.split(';')[0] ?? '';
  }

  const get = (path: string, cookie?: string) =>
    fetch(`${baseUrl}${path}`, { headers: cookie ? { cookie } : {} });
  const errorCode = async (res: Response) => ApiErrorSchema.parse(await res.json()).code;

  describe('POST /auth/login', () => {
    it('signs in and sets a secure session cookie', async () => {
      const res = await login('admin@test.com', 'Test@1234');
      expect(res.status).toBe(200);
      const user = SessionUserSchema.parse(await res.json());
      expect(user.email).toBe('admin@test.com');
      const setCookie = res.headers.get('set-cookie') ?? '';
      expect(setCookie).toContain(`${SESSION_COOKIE}=`);
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
      expect(setCookie).toContain('Max-Age=43200'); // 12 hours
    });

    it('treats the email case-insensitively', async () => {
      expect((await login('  ADMIN@Test.com ', 'Test@1234')).status).toBe(200);
    });

    it('gives the same answer for a wrong password, an unknown email and a deactivated account', async () => {
      users[1]!.isActive = false;
      for (const [email, password] of [
        ['admin@test.com', 'wrong'],
        ['nobody@test.com', 'Test@1234'],
        ['kitchen@test.com', 'Test@1234'],
      ] as const) {
        const res = await login(email, password);
        expect(res.status).toBe(401);
        const body = ApiErrorSchema.parse(await res.json());
        expect(body).toEqual({
          code: 'INVALID_CREDENTIALS',
          message: 'Email or password is incorrect',
        });
      }
    });

    it('rejects a malformed request with field errors', async () => {
      const res = await login('not-an-email', '');
      expect(res.status).toBe(400);
      const body = ApiErrorSchema.parse(await res.json());
      expect(Object.keys(body.fieldErrors ?? {}).sort()).toEqual(['email', 'password']);
    });
  });

  describe('sessions', () => {
    it('GET /auth/me returns the signed-in user', async () => {
      const res = await get('/auth/me', await sessionCookie('kitchen@test.com'));
      expect(res.status).toBe(200);
      const user = SessionUserSchema.parse(await res.json());
      expect(user.role.name).toBe('Kitchen');
      // Stored names that no longer exist in code are dropped.
      expect(user.permissions).toEqual(['kitchen.view', 'orders.read']);
    });

    it('rejects requests without a session', async () => {
      const res = await get('/auth/me');
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe('UNAUTHENTICATED');
    });

    it('rejects a tampered token', async () => {
      const cookie = await sessionCookie('kitchen@test.com');
      expect((await get('/auth/me', `${cookie}x`)).status).toBe(401);
    });

    it('rejects an expired token', async () => {
      const expired = await jwt.signAsync({ sub: users[0]!.id }, { expiresIn: -10 });
      expect((await get('/auth/me', `${SESSION_COOKIE}=${expired}`)).status).toBe(401);
    });

    it('locks out a user as soon as they are deactivated, without waiting for the token to expire', async () => {
      const cookie = await sessionCookie('kitchen@test.com');
      users[1]!.isActive = false;
      expect((await get('/auth/me', cookie)).status).toBe(401);
    });

    it('POST /auth/logout clears the cookie', async () => {
      const res = await fetch(`${baseUrl}/auth/logout`, { method: 'POST' });
      expect(res.status).toBe(204);
      expect(res.headers.get('set-cookie')).toMatch(new RegExp(`^${SESSION_COOKIE}=;`));
    });
  });

  describe('permissions', () => {
    it('lets anyone reach a public route', async () => {
      expect((await get('/probe/public')).status).toBe(200);
    });

    it('lets any signed-in user reach a signed-in route', async () => {
      expect((await get('/probe/signed-in', await sessionCookie('kitchen@test.com'))).status).toBe(
        200,
      );
    });

    it('allows a role that has the permission', async () => {
      expect((await get('/probe/kitchen', await sessionCookie('kitchen@test.com'))).status).toBe(
        200,
      );
    });

    it('forbids a role without the permission, even when calling the API directly', async () => {
      const res = await get('/probe/override', await sessionCookie('kitchen@test.com'));
      expect(res.status).toBe(403);
      expect(await errorCode(res)).toBe('FORBIDDEN');
    });

    it('gives the system Admin role every permission, even with none stored', async () => {
      expect((await get('/probe/override', await sessionCookie('admin@test.com'))).status).toBe(
        200,
      );
    });

    it('allows "any of" when one permission matches, refuses when none does', async () => {
      const cookie = await sessionCookie('kitchen@test.com');
      expect((await get('/probe/any', cookie)).status).toBe(200);
      expect((await get('/probe/any-missing', cookie)).status).toBe(403);
    });

    it('refuses a route that declares no access rule, even for an admin', async () => {
      const res = await get('/probe/forgotten', await sessionCookie('admin@test.com'));
      expect(res.status).toBe(403);
    });
  });
});
