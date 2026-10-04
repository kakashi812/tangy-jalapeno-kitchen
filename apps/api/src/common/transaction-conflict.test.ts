import { describe, expect, it } from 'vitest';
import { isTransactionConflict } from './transaction-conflict.js';
describe('transaction conflict classification', () => {
  it('recognises ORM conflicts and raw-query serialization/deadlock conflicts', () => {
    expect(isTransactionConflict({ code: 'P2034' })).toBe(true);
    expect(isTransactionConflict({ code: 'P2010', meta: { code: '40001' } })).toBe(true);
    expect(isTransactionConflict({ code: 'P2010', meta: { code: '40P01' } })).toBe(true);
  });
  it('recognises the actual Neon adapter metadata shape without matching error text', () => {
    for (const originalCode of ['40001', '40P01'])
      expect(
        isTransactionConflict({
          code: 'P2010',
          meta: {
            driverAdapterError: {
              name: 'DriverAdapterError',
              cause: { originalCode, kind: 'TransactionWriteConflict' },
            },
          },
        }),
      ).toBe(true);
    expect(
      isTransactionConflict({
        code: 'P2010',
        meta: {
          driverAdapterError: { cause: { originalCode: '42601', originalMessage: '40001' } },
        },
      }),
    ).toBe(false);
  });
  it('never retries syntax, constraint, connectivity or ordinary application errors', () => {
    for (const error of [
      null,
      undefined,
      '40001',
      new Error('offline'),
      { code: 'P2002' },
      { code: 'P2010' },
      { code: 'P2010', meta: { code: '42601' } },
      { code: 'P2010', meta: { code: '23505' } },
    ])
      expect(isTransactionConflict(error)).toBe(false);
  });
});
