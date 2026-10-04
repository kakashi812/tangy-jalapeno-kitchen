import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureApp } from '../app.setup.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'orders-test-secret-at-least-32-characters';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const users = [
  {
    id: id(1),
    email: 'admin@test.com',
    name: 'Admin',
    isActive: true,
    role: { id: id(10), name: 'Admin', isSystem: true, permissions: [] },
  },
  {
    id: id(2),
    email: 'kitchen@test.com',
    name: 'Kitchen',
    isActive: true,
    role: { id: id(11), name: 'Kitchen', isSystem: false, permissions: ['orders.read'] },
  },
  {
    id: id(3),
    email: 'dispatch@test.com',
    name: 'Dispatch',
    isActive: true,
    role: {
      id: id(12),
      name: 'Dispatch',
      isSystem: false,
      permissions: ['orders.read', 'drops.assign'],
    },
  },
  {
    id: id(4),
    email: 'driver@test.com',
    name: 'Driver',
    isActive: true,
    role: { id: id(13), name: 'Driver', isSystem: false, permissions: ['deliveries.own'] },
  },
];
describe('order endpoint access and validation', () => {
  let app: INestApplication, base: string, jwt: JwtService;
  const service = {
    list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    create: vi.fn().mockResolvedValue({ id: id(100) }),
    get: vi.fn().mockResolvedValue({ id: id(100) }),
    processDue: vi.fn().mockResolvedValue({ confirmed: 0, cancelled: 0 }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule],
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: service }],
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
  const request = async (path: string, user?: number, method = 'GET', body?: unknown) =>
    fetch(base + path, {
      method,
      headers: {
        ...(user ? { cookie: `fl_session=${await jwt.signAsync({ sub: id(user) })}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  it('requires a session for order reads', async () => {
    expect((await request('/orders')).status).toBe(401);
  });
  it('allows kitchen and dispatch reads but not driver reads', async () => {
    expect((await request('/orders', 2)).status).toBe(200);
    expect((await request('/orders', 3)).status).toBe(200);
    expect((await request('/orders', 4)).status).toBe(403);
  });
  it('blocks kitchen writes before validation or service execution', async () => {
    expect((await request('/orders', 2, 'POST', {})).status).toBe(403);
    expect(service.create).not.toHaveBeenCalled();
  });
  it('blocks dispatch overrides and employee/menu ordering context', async () => {
    expect((await request(`/orders/${id(100)}/override`, 3, 'PUT', {})).status).toBe(403);
    expect((await request('/orders/context', 3)).status).toBe(403);
  });
  it('blocks cutoff closure for non-admin read-only staff', async () => {
    expect((await request('/orders/close', 2, 'POST', { deliveryDate: '2099-01-07' })).status).toBe(
      403,
    );
  });
  it('malformed IDs are a 404, never database errors', async () => {
    expect((await request('/orders/not-a-uuid', 1)).status).toBe(404);
  });
  it('validates creation with the shared schema', async () => {
    const response = await request('/orders', 1, 'POST', {
      employeeId: id(20),
      deliveryDate: 'not-a-date',
      lines: [],
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
  });
  it('cron fails closed without a secret and validates its bearer credential', async () => {
    const original = process.env.CRON_SECRET;
    try {
      delete process.env.CRON_SECRET;
      expect((await request('/internal/cutoff')).status).toBe(401);
      process.env.CRON_SECRET = 'orders-cron-test-secret';
      expect(
        (await fetch(base + '/internal/cutoff', { headers: { authorization: 'Bearer wrong' } }))
          .status,
      ).toBe(401);
      expect(
        (
          await fetch(base + '/internal/cutoff', {
            headers: { authorization: 'Bearer orders-cron-test-secret' },
          })
        ).status,
      ).toBe(200);
    } finally {
      if (original === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = original;
    }
  });
});
