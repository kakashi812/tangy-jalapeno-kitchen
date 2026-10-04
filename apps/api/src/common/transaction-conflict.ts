/** Raw row-lock queries expose PostgreSQL SQLSTATE through P2010, not Prisma's P2034. */
export function isTransactionConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  if (error.code === 'P2034') return true;
  if (
    error.code !== 'P2010' ||
    !('meta' in error) ||
    typeof error.meta !== 'object' ||
    error.meta === null
  )
    return false;
  const isConflictCode = (code: unknown) => code === '40001' || code === '40P01';
  if ('code' in error.meta && isConflictCode(error.meta.code)) return true;
  // Prisma's Neon adapter preserves SQLSTATE under the driver error's cause.
  if (!('driverAdapterError' in error.meta)) return false;
  const adapter = error.meta.driverAdapterError;
  if (typeof adapter !== 'object' || adapter === null || !('cause' in adapter)) return false;
  const cause = adapter.cause;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'originalCode' in cause &&
    isConflictCode(cause.originalCode)
  );
}
