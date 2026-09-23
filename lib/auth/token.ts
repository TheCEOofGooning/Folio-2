/**
 * lib/auth/token.ts — the cookie format.
 *
 * A session cookie is `<token>.<hmac>`:
 *
 *   • `token` — 256 bits of `crypto.getRandomValues`. Only its SHA-256 is
 *     stored in Postgres, so a database dump cannot be replayed.
 *   • `hmac`  — HMAC-SHA256(AUTH_SECRET, token). This is what makes the cookie
 *     *self-authenticating*: `proxy.ts` can reject forged or malformed cookies
 *     with pure CPU work and never touch the database.
 *
 * No JWT: the payload lives server-side, so there is nothing to decode, no
 * algorithm confusion, and revocation is a single `DELETE`.
 */

import { hmacSha256Base64Url, randomBytes, sha256Hex, timingSafeEqual, toBase64Url } from './crypto';
import { getAuthSecret } from './secret';

const TOKEN_BYTES = 32;

export function generateSessionToken(): string {
  return toBase64Url(randomBytes(TOKEN_BYTES));
}

export async function sealToken(token: string): Promise<string> {
  return `${token}.${await hmacSha256Base64Url(getAuthSecret(), token)}`;
}

/**
 * Verifies the MAC and returns the raw token, or `null` when the cookie is
 * absent, malformed or tampered with. Pure CPU work — safe in `proxy.ts`.
 */
export async function openToken(cookieValue: string | undefined | null): Promise<string | null> {
  if (!cookieValue) return null;
  const dot = cookieValue.lastIndexOf('.');
  if (dot <= 0 || dot === cookieValue.length - 1) return null;
  const token = cookieValue.slice(0, dot);
  const signature = cookieValue.slice(dot + 1);
  const expected = await hmacSha256Base64Url(getAuthSecret(), token);
  return timingSafeEqual(signature, expected) ? token : null;
}

/** The value stored in `sessions.token_hash`. */
export function hashToken(token: string): Promise<string> {
  return sha256Hex(token);
}
