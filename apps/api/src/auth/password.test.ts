import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('Test@1234');
    expect(hash).not.toContain('Test@1234');
    expect(await verifyPassword('Test@1234', hash)).toBe(true);
    expect(await verifyPassword('test@1234', hash)).toBe(false);
  });

  it('salts each hash, so equal passwords give different hashes', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });
});
