import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureApp } from '../app.setup.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { KitchenController } from './kitchen.controller.js';
import { KitchenService } from './kitchen.service.js';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'kitchen-test-secret-at-least-32-characters';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const users = [
  {
    id: id(1),
    email: 'admin@test.com',
    name: 'Admin',
    isActive: true,
    role: { id: id(11), name: 'Admin', isSystem: true, permissions: [] },
  },
  {
    id: id(2),
    email: 'kitchen@test.com',
    name: 'Kitchen',
    isActive: true,
    role: {
      id: id(12),
      name: 'Kitchen',
      isSystem: false,
      permissions: ['kitchen.view', 'kitchen.work'],
    },
  },
  {
    id: id(3),
    email: 'dispatch@test.com',
    name: 'Dispatch',
    isActive: true,
    role: { id: id(13), name: 'Dispatch', isSystem: false, permissions: ['dispatch.view'] },
  },
  {
    id: id(4),
    email: 'driver@test.com',
    name: 'Driver',
    isActive: true,
    role: { id: id(14), name: 'Driver', isSystem: false, permissions: ['deliveries.own'] },
  },
];
describe('kitchen endpoint permissions', () => {
  let app: INestApplication, base: string, jwt: JwtService;
  const service = {
    board: vi.fn().mockResolvedValue({ units: { items: [] } }),
    work: vi.fn().mockResolvedValue({ id: id(100) }),
    forceComplete: vi.fn().mockResolvedValue({ id: id(100) }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule],
      controllers: [KitchenController],
      providers: [{ provide: KitchenService, useValue: service }],
    })
      .overrideProvider(PrismaService)
      .useValue({
        user: {
          findUnique: async ({ where }: { where: { id: string } }) =>
            users.find((u) => u.id === where.id),
        },
      })
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0);
    base = await app.getUrl();
    jwt = module.get(JwtService);
  });
  afterAll(async () => {
    await app.close();
  });
  const req = async (path: string, user?: number, method = 'GET', body?: unknown) =>
    fetch(base + path, {
      method,
      headers: {
        ...(user ? { cookie: `fl_session=${await jwt.signAsync({ sub: id(user) })}` } : {}),
        'content-type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  it('requires a session', async () => {
    expect((await req('/kitchen')).status).toBe(401);
  });
  it('permits admin and kitchen viewing', async () => {
    for (const user of [1, 2]) expect((await req('/kitchen', user)).status).toBe(200);
  });
  it('blocks dispatch and driver viewing and writes', async () => {
    for (const user of [3, 4]) {
      expect((await req('/kitchen', user)).status).toBe(403);
      expect((await req(`/kitchen/units/${id(100)}/done`, user, 'POST', {})).status).toBe(403);
    }
  });
  it('allows kitchen start and done but not force completion', async () => {
    for (const action of ['start', 'done'])
      expect((await req(`/kitchen/units/${id(100)}/${action}`, 2, 'POST', {})).status).toBe(201);
    expect(
      (await req(`/kitchen/orders/${id(100)}/force-complete`, 2, 'POST', { version: 0 })).status,
    ).toBe(403);
  });
  it('allows admin force completion with a version', async () => {
    expect(
      (await req(`/kitchen/orders/${id(100)}/force-complete`, 1, 'POST', { version: 0 })).status,
    ).toBe(201);
  });
  it('rejects oversized board pages, bad dates and missing force versions', async () => {
    expect((await req('/kitchen?pageSize=401', 1)).status).toBe(400);
    expect((await req('/kitchen?deliveryDate=bad', 1)).status).toBe(400);
    expect((await req(`/kitchen/orders/${id(100)}/force-complete`, 1, 'POST', {})).status).toBe(
      400,
    );
  });
  it('returns 404 for malformed unit IDs', async () => {
    expect((await req('/kitchen/units/bad/start', 1, 'POST', {})).status).toBe(404);
  });
});
