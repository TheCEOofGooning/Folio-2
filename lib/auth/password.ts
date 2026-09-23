/**
 * lib/auth/password.ts — password hashing on top of Web Crypto.
 *
 * Stored format: `pbkdf2$sha256$<iterations>$<salt>$<hash>` (salt/hash are
 * base64url). Keeping the parameters inline means the cost factor can be
 * raised later and old hashes keep verifying.
 */

import { fromBase64Url, pbkdf2, randomBytes, timingSafeEqual, toBase64Url } from './crypto';

export const PBKDF2_ITERATIONS = 210_000;
const KEY_LENGTH_BYTES = 32;
const SALT_BYTES = 16;
const ALGORITHM = 'pbkdf2$sha256';

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH_BYTES);
  return `${ALGORITHM}$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 5 || `${parts[0]}$${parts[1]}` !== ALGORITHM) return false;
  const iterations = Number(parts[2]);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromBase64Url(parts[3]);
    expected = fromBase64Url(parts[4]);
  } catch {
    return false;
  }

  const actual = await pbkdf2(password, salt, iterations, expected.length);
  return timingSafeEqual(actual, expected);
}

/** Cheap structural check used by the signup form and the tests. */
export function isPasswordHash(value: string): boolean {
  return value.startsWith(`${ALGORITHM}$`) && value.split('$').length === 5;
}
