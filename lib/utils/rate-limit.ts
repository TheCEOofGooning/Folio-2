/**
 * lib/utils/rate-limit.ts — a tiny in-memory sliding window.
 *
 * On Vercel each isolate gets its own counters, so this is a *speed bump* that
 * stops casual credential stuffing and view-count spam, not a distributed
 * limiter. It costs zero dependencies and zero latency, which is the right
 * trade for the abuse it is aimed at. Swap in Upstash/Redis here if you need
 * global guarantees — nothing else changes.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, remaining: 0, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/** Convenience wrapper: 10 auth attempts per IP per 10 minutes. */
export function rateLimitAuth(ip: string): RateLimitResult {
  return rateLimit(`auth:${ip}`, 10, 600_000);
}

/** Convenience wrapper: 60 view beacons per reader per minute. */
export function rateLimitView(key: string): RateLimitResult {
  return rateLimit(`view:${key}`, 60, 60_000);
}
