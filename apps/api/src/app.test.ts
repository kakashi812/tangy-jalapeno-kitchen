import 'reflect-metadata';
import { Body, Controller, Get, HttpStatus, Post, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiErrorSchema } from '@fernleaf/shared';
import { configureApp } from './app.setup.js';
import { ApiException } from './common/api-exception.js';
import { ZodValidationPipe } from './common/zod-validation.pipe.js';
import { HealthController } from './health/health.controller.js';
import { PrismaService } from './prisma/prisma.service.js';

const QuantitySchema = z.object({ quantity: z.number().int().min(1) });

/** Endpoints that exist only in this test, to exercise validation and error handling. */
@Controller('test')
class ProbeController {
  @Post('validate')
  validate(@Body(new ZodValidationPipe(QuantitySchema)) body: z.infer<typeof QuantitySchema>) {
    return body;
  }

  @Get('domain-error')
  domainError() {
    throw new ApiException(HttpStatus.CONFLICT, 'CUTOFF_PASSED', 'Orders for this date are locked');
  }

  @Get('crash')
  crash() {
    throw new Error('secret internal detail');
  }

  @Get('duplicate')
  duplicate() {
    throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  }
}

describe('API app', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController, ProbeController],
      providers: [
        { provide: PrismaService, useValue: { $queryRaw: async () => [{ '?column?': 1 }] } },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string) => fetch(`${baseUrl}${path}`);
  const post = (path: string, body: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  /** Parses the response as the shared error shape, so each test also checks the shape itself. */
  const apiError = async (res: Response) => ApiErrorSchema.parse(await res.json());

  it('GET /health reports ok with the kitchen time zone', async () => {
    const res = await get('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: 'ok',
      database: 'ok',
      kitchenTimeZone: 'Asia/Kolkata',
    });
  });

  it('returns the parsed body when validation passes', async () => {
    const res = await post('/test/validate', { quantity: 3 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ quantity: 3 });
  });

  it('returns VALIDATION_FAILED with per-field errors', async () => {
    const res = await post('/test/validate', { quantity: 0 });
    expect(res.status).toBe(400);
    const body = await apiError(res);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(body.fieldErrors ?? {})).toEqual(['quantity']);
  });

  it('passes domain errors through unchanged', async () => {
    const res = await get('/test/domain-error');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: 'CUTOFF_PASSED',
      message: 'Orders for this date are locked',
    });
  });

  it('maps unknown routes to NOT_FOUND in the shared shape', async () => {
    const res = await get('/nope');
    expect(res.status).toBe(404);
    expect((await apiError(res)).code).toBe('NOT_FOUND');
  });

  it('maps a Prisma unique-constraint error to CONFLICT', async () => {
    const res = await get('/test/duplicate');
    expect(res.status).toBe(409);
    expect((await apiError(res)).code).toBe('CONFLICT');
  });

  it('hides internal details of unexpected errors', async () => {
    const res = await get('/test/crash');
    expect(res.status).toBe(500);
    const body = await apiError(res);
    expect(body.code).toBe('INTERNAL');
    expect(JSON.stringify(body)).not.toContain('secret internal detail');
  });
});
