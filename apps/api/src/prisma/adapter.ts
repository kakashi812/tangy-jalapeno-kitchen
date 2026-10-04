import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Neon's serverless driver talks to Neon over WebSockets, which a plain PostgreSQL server (such as
 * the local docker-compose database) doesn't speak. Neon hosts use the Neon driver; any other
 * PostgreSQL uses node-postgres. Production on Vercel always points at Neon.
 */
export function createAdapter(connectionString: string) {
  return isNeonUrl(connectionString)
    ? new PrismaNeon({ connectionString })
    : new PrismaPg({ connectionString });
}

export function isNeonUrl(connectionString: string): boolean {
  try {
    return new URL(connectionString).hostname.endsWith('.neon.tech');
  } catch {
    return false;
  }
}
