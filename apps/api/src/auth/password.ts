import bcrypt from 'bcryptjs';

/**
 * bcrypt cost 10 ≈ 1024 hashing rounds: slow enough to make guessing stolen hashes expensive,
 * fast enough (~100 ms in pure JS) for a sign-in request on a serverless function.
 */
const COST = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
