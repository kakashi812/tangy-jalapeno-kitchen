import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureApp } from '../app.setup.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DeliveriesController, DropsController } from './drops.controller.js';
import { DropsService } from './drops.service.js';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'drop-test-secret-at-least-32-characters';
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
    role: {
      id: id(13),
      name: 'Dispatch',
      isSystem: false,
      permissions: ['dispatch.view', 'drops.assign', 'drops.advance'],
    },
  },
  {
    id: id(4),
    email: 'driver@test.com',
    name: 'Driver',
    isActive: true,
    role: { id: id(14), name: 'Driver', isSystem: false, permissions: ['deliveries.own'] },
  },
];
describe('dispatch and delivery endpoint access', () => {
  let app: INestApplication, base: string, jwt: JwtService;
  const service = {
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    get: vi.fn().mockResolvedValue({ id: id(100) }),
    drivers: vi.fn().mockResolvedValue([]),
    assign: vi.fn().mockResolvedValue({ id: id(100) }),
    advance: vi.fn().mockResolvedValue({ id: id(100) }),
    deliver: vi.fn().mockResolvedValue({ id: id(100) }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule],
      controllers: [DropsController, DeliveriesController],
      providers: [{ provide: DropsService, useValue: service }],
    })
      .overrideProvider(PrismaService)
      .useValue({
        user: {
          findUnique: async ({ where }: { where: { id: string } }) =>
            users.find((user) => user.id === where.id),
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
  async function req(path: string, user?: number, method = 'GET', body?: unknown) {
    return fetch(base + path, {
      method,
      headers: {
        ...(user && { cookie: `fl_session=${await jwt.signAsync({ sub: id(user) })}` }),
        'content-type': 'application/json',
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  }
  it('requires a session', async () => {
    expect((await req('/drops')).status).toBe(401);
    expect((await req('/deliveries')).status).toBe(401);
  });
  it('allows dispatch/admin lists and blocks kitchen/driver', async () => {
    for (const user of [1, 3]) expect((await req('/drops', user)).status).toBe(200);
    for (const user of [2, 4]) expect((await req('/drops', user)).status).toBe(403);
  });
  it('allows driver own-deliveries but not dispatch or kitchen', async () => {
    expect((await req('/deliveries', 4)).status).toBe(200);
    for (const user of [2, 3]) expect((await req('/deliveries', user)).status).toBe(403);
    expect(service.list).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ id: id(4) }),
      'today',
    );
    await req('/deliveries?window=past', 4);
    expect(service.list).toHaveBeenLastCalledWith(
      { page: 1, pageSize: 20 },
      expect.objectContaining({ id: id(4) }),
      'past',
    );
    expect((await req('/deliveries?window=everything', 4)).status).toBe(400);
  });
  it('allows dispatch assignment/steps and blocks driver/kitchen mutations', async () => {
    expect(
      (await req(`/drops/${id(100)}/driver`, 3, 'PUT', { version: 0, driverId: null })).status,
    ).toBe(200);
    for (const step of ['ready', 'depart']) {
      expect((await req(`/drops/${id(100)}/${step}`, 3, 'POST', { version: 0 })).status).toBe(201);
      for (const user of [2, 4])
        expect((await req(`/drops/${id(100)}/${step}`, user, 'POST', { version: 0 })).status).toBe(
          403,
        );
    }
  });
  it('limits delivery completion to deliveries.own', async () => {
    expect(
      (await req(`/deliveries/${id(100)}/deliver`, 4, 'POST', { version: 0, note: 'Done' })).status,
    ).toBe(201);
    for (const user of [2, 3])
      expect(
        (await req(`/deliveries/${id(100)}/deliver`, user, 'POST', { version: 0 })).status,
      ).toBe(403);
  });
  it('allows driver detail route through ownership-scoped service, blocks kitchen', async () => {
    expect((await req(`/drops/${id(100)}`, 4)).status).toBe(200);
    expect(service.get).toHaveBeenCalledWith(
      id(100),
      expect.any(Object),
      expect.objectContaining({ id: id(4) }),
    );
    expect((await req(`/drops/${id(100)}`, 2)).status).toBe(403);
  });
  it('validates versions, IDs and pagination', async () => {
    expect((await req(`/drops/${id(100)}/depart`, 3, 'POST', {})).status).toBe(400);
    expect((await req('/drops/not-a-uuid', 3)).status).toBe(404);
    expect((await req('/drops?pageSize=401', 3)).status).toBe(400);
  });
});
