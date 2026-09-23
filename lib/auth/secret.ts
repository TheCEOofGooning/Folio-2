/**
 * lib/auth/secret.ts — cookie name, lifetime and signing secret.
 *
 * Deliberately free of `next/headers` and database imports so `proxy.ts` can
 * pull it in without dragging the data layer into the routing layer.
 */

export const SESSION_COOKIE = 'folio_session';
/** 30 days. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const DEV_SECRET = 'folio-development-secret-change-me';

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET is required in production: set a 32+ character random string.');
  }
  return DEV_SECRET;
}

export function sessionCookieOptions(maxAgeSeconds = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
