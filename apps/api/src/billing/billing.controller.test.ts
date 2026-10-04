import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureApp } from '../app.setup.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'billing-test-secret-at-least-32-characters';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const users = [
  {
    id: id(1),
    isActive: true,
    role: { id: id(11), name: 'Admin', isSystem: true, permissions: [] },
  },
  {
    id: id(2),
    isActive: true,
    role: { id: id(12), name: 'Kitchen', isSystem: false, permissions: ['kitchen.work'] },
  },
  {
    id: id(3),
    isActive: true,
    role: { id: id(13), name: 'Dispatch', isSystem: false, permissions: ['dispatch.view'] },
  },
  {
    id: id(4),
    isActive: true,
    role: { id: id(14), name: 'Driver', isSystem: false, permissions: ['deliveries.own'] },
  },
  {
    id: id(5),
    isActive: true,
    role: { id: id(15), name: 'Accounts reader', isSystem: false, permissions: ['billing.read'] },
  },
];
describe('billing endpoint protection', () => {
  let app: INestApplication, base: string, jwt: JwtService;
  const service = {
    companies: vi.fn().mockResolvedValue([]),
    uninvoiced: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    get: vi.fn().mockResolvedValue({ id: id(20) }),
    create: vi.fn().mockResolvedValue({ id: id(20) }),
    pay: vi.fn().mockResolvedValue({ id: id(20) }),
    reportShort: vi.fn().mockResolvedValue({ id: id(20) }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule],
      controllers: [BillingController],
      providers: [{ provide: BillingService, useValue: service }],
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
  async function req(path: string, user?: number, body?: unknown) {
    return fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        'content-type': 'application/json',
        ...(user && { cookie: `fl_session=${await jwt.signAsync({ sub: id(user) })}` }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  }
  it('requires authentication for billing', async () =>
    expect((await req('/billing/invoices')).status).toBe(401));
  it('allows admin and custom billing reader, denies kitchen/dispatch/driver', async () => {
    for (const path of [
      '/billing/companies',
      '/billing/uninvoiced',
      '/billing/invoices',
      `/billing/invoices/${id(20)}`,
    ]) {
      for (const user of [1, 5]) expect((await req(path, user)).status).toBe(200);
      for (const user of [2, 3, 4]) expect((await req(path, user)).status).toBe(403);
    }
  });
  it('requires billing.manage on every write', async () => {
    const writes: [string, unknown][] = [
      ['/billing/invoices', { companyId: id(10), orders: [{ id: id(20), version: 0 }] }],
      [`/billing/invoices/${id(20)}/pay`, { version: 0 }],
      [`/billing/orders/${id(20)}/short`, { version: 0, note: 'Missing bowl' }],
    ];
    for (const [path, body] of writes) {
      expect((await req(path, 1, body)).status).toBe(201);
      for (const user of [2, 3, 4, 5]) expect((await req(path, user, body)).status).toBe(403);
    }
  });
  it('validates invoice selections, stale-form versions, date filters and IDs', async () => {
    expect((await req('/billing/invoices', 1, { companyId: id(10), orders: [] })).status).toBe(400);
    expect((await req(`/billing/invoices/${id(20)}/pay`, 1, {})).status).toBe(400);
    expect((await req('/billing/uninvoiced?through=2026-02-30', 1)).status).toBe(400);
    expect((await req('/billing/invoices?pageSize=101', 1)).status).toBe(400);
    expect((await req('/billing/invoices/not-a-uuid', 1)).status).toBe(404);
  });
});
