/**
 * Session lifecycle.
 *
 * Read path (`getSession`) is safe to call from anywhere — it is wrapped in
 * React's `cache()` so a page with a navbar, an avatar and a bookmark button
 * still performs exactly one cookie read and one database query.
 *
 * Write path (`createSession`, `destroySession`) touches cookies, which Next only
 * permits inside Server Actions and Route Handlers — that is exactly where they
 * are called from.
 */
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { sql, maybe } from "@/db";
import type { SessionUser } from "@/db/types";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySessionToken } from "./tokens";

/**
 * Resolves the signed-in reader for this request.
 *
 * One query, joining the session row (revocation + expiry) to the user profile.
 * `cache()` dedupes it across the whole render tree.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  try {
    const user = await maybe<SessionUser>(sql`
      select u.id, u.email, u.username, u.display_name as "displayName",
             u.avatar_url as "avatarUrl", u.avatar_hue as "avatarHue"
        from sessions s
        join users u on u.id = s.user_id
       where s.id = ${payload.sid}::uuid
         and s.user_id = ${payload.uid}::uuid
         and s.expires_at > now()
    `);
    return user;
  } catch {
    // A database blip must not 500 the whole page — visitors stay signed out.
    return null;
  }
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/login?next=dashboard");
  return user;
}

export async function createSession(userId: string): Promise<void> {
  const requestHeaders = await headers();
  const userAgent = (requestHeaders.get("user-agent") ?? "").slice(0, 240);

  const session = await maybe<{ id: string }>(sql`
    insert into sessions (user_id, user_agent, expires_at)
    values (${userId}::uuid, ${userAgent}, now() + ${`${SESSION_TTL_SECONDS} seconds`}::interval)
    returning id
  `);
  if (!session) throw new Error("Could not create a session");

  const token = await signSession({
    sid: session.id,
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    const payload = await verifySessionToken(token);
    if (payload) {
      // Best-effort revocation; the cookie is cleared regardless.
      await sql`delete from sessions where id = ${payload.sid}::uuid`.catch(() => undefined);
    }
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Removes expired rows. Called opportunistically from the session beacon. */
export async function pruneExpiredSessions(): Promise<void> {
  await sql`delete from sessions where expires_at < now()`.catch(() => undefined);
}
