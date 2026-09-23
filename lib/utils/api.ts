/** lib/utils/api.ts — tiny helpers shared by the route handlers. */

import { NextResponse } from 'next/server';

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: { 'cache-control': 'no-store', ...(init?.headers ?? {}) },
  });
}

export function fail(message: string, status = 400): NextResponse {
  return json({ error: message }, { status });
}

export function unauthorized(message = 'Sign in to continue.'): NextResponse {
  return fail(message, 401);
}

/** Best-effort client IP from Vercel's forwarded headers. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
