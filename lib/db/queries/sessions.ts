/**
 * lib/db/queries/sessions.ts — persistence for the Web-Crypto session tokens
 * created in lib/auth/session.ts. Only SHA-256 hashes are ever stored.
 */

import { query, queryOne } from '@/lib/db';

export interface SessionRow {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
}

export async function createSession(input: {
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  ipHash?: string | null;
}): Promise<void> {
  await query(
    `insert into sessions (user_id, token_hash, expires_at, user_agent, ip_hash)
     values ($1, $2, $3, $4, $5)`,
    [input.userId, input.tokenHash, input.expiresAt.toISOString(), input.userAgent ?? null, input.ipHash ?? null],
  );
}

export function getSessionByTokenHash(tokenHash: string): Promise<SessionRow | null> {
  return queryOne<SessionRow>(
    `select id, user_id, token_hash, expires_at, created_at
     from sessions
     where token_hash = $1 and expires_at > now()
     limit 1`,
    [tokenHash],
  );
}

export function deleteSessionByTokenHash(tokenHash: string): Promise<void> {
  return query(`delete from sessions where token_hash = $1`, [tokenHash]).then(() => undefined);
}

/** Opportunistic GC — cheaper than a cron and keeps the table small. */
export function deleteExpiredSessions(): Promise<void> {
  return query(`delete from sessions where expires_at <= now()`).then(() => undefined);
}

export function countActiveSessions(userId: number): Promise<number> {
  return queryOne<{ n: number }>(
    `select count(*) as n from sessions where user_id = $1 and expires_at > now()`,
    [userId],
  ).then((r) => r?.n ?? 0);
}
