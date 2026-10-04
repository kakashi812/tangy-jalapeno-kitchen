import { describe, expect, it } from 'vitest';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';
import { createAdapter, isNeonUrl } from './adapter.js';

describe('createAdapter', () => {
  it('uses the Neon driver for Neon hosts', () => {
    const url = 'postgresql://u:p@ep-x-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require';
    expect(isNeonUrl(url)).toBe(true);
    expect(createAdapter(url)).toBeInstanceOf(PrismaNeon);
  });

  it('uses node-postgres for any other PostgreSQL', () => {
    const url = 'postgresql://fernleaf:fernleaf@localhost:5432/fernleaf';
    expect(isNeonUrl(url)).toBe(false);
    expect(createAdapter(url)).toBeInstanceOf(PrismaPg);
  });

  it('does not treat a lookalike host as Neon', () => {
    expect(isNeonUrl('postgresql://u:p@neon.tech.example.com/db')).toBe(false);
    expect(isNeonUrl('not a url')).toBe(false);
  });
});
