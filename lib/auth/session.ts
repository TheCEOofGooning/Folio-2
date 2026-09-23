/**
 * lib/auth/session.ts — the request-scoped half of auth.
 *
 * Reading the session is two cheap steps: verify the cookie MAC in-process,
 * then a single indexed lookup on `sessions.token_hash`. There is no token
 * decode, no key exchange and no network hop beyond the one query.
 */

import { cookies, headers } from 'next/headers';
import {
  createSession,
  deleteExpiredSessions,
  deleteSessionByTokenHash,
  getSessionByTokenHash,
} from '@/lib/db/queries/sessions';
import { findUserById } from '@/lib/db/queries/users';
import type { UserRow } from '@/lib/db/queries/types';
import { sha256Hex } from './crypto';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, getAuthSecret, sessionCookieOptions } from './secret';
import { generateSessionToken, hashToken, openToken, sealToken } from './token';

export interface SessionUser {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export function toSessionUser(user: UserRow): SessionUser {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
  };
}

async function requestContext(): Promise<{ userAgent: string | null; ip: string | null }> {
  const store = await headers();
  return {
    userAgent: store.get('user-agent')?.slice(0, 200) ?? null,
    ip: store.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  };
}

/** Creates a session row and returns the sealed cookie value. */
export async function issueSession(userId: number): Promise<string> {
  const token = generateSessionToken();
  const [sealed, tokenHash] = await Promise.all([sealToken(token), hashToken(token)]);
  const { userAgent, ip } = await requestContext();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await createSession({
    userId,
    tokenHash,
    expiresAt,
    userAgent,
    // Never store a raw IP: a salted hash is enough to spot session sharing.
    ipHash: ip ? await sha256Hex(`${ip}|${getAuthSecret()}`) : null,
  });

  // Amortised garbage collection — cheaper than a cron on a serverless platform.
  if (Math.random() < 0.05) await deleteExpiredSessions();

  return sealed;
}

export async function setSessionCookie(value: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, value, sessionCookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', sessionCookieOptions(0));
}

/** Verifies the cookie and resolves the session row. Returns the user id. */
export async function readSessionUserId(): Promise<number | null> {
  const store = await cookies();
  const token = await openToken(store.get(SESSION_COOKIE)?.value);
  if (!token) return null;
  const session = await getSessionByTokenHash(await hashToken(token));
  return session?.user_id ?? null;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const userId = await readSessionUserId();
  if (!userId) return null;
  const user = await findUserById(userId);
  return user ? toSessionUser(user) : null;
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = await openToken(store.get(SESSION_COOKIE)?.value);
  if (token) await deleteSessionByTokenHash(await hashToken(token));
  await clearSessionCookie();
}

/**
 * Stable, privacy-preserving reader fingerprint used for view de-duplication.
 * Salted so the value cannot be correlated across deployments.
 */
export async function viewerKey(request?: Request): Promise<string> {
  if (request) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const ua = request.headers.get('user-agent') ?? 'unknown';
    return sha256Hex(`${ip}|${ua}|${getAuthSecret()}`).then((h) => h.slice(0, 32));
  }
  const { userAgent, ip } = await requestContext();
  return (await sha256Hex(`${ip ?? 'unknown'}|${userAgent ?? 'unknown'}|${getAuthSecret()}`)).slice(0, 32);
}
