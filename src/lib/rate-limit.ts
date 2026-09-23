/**
 * In-process sliding-window rate limiter for authentication endpoints.
 *
 * Honest about what it is: on Vercel each serverless instance keeps its own map,
 * so this stops a burst against one instance and does not stop a distributed
 * attack. It is the cheap 90% — brute-force attempts from a single client are the
 * common case, and PBKDF2's 210k iterations are the real backstop.
 *
 * For a hard global limit, back this with a Neon table (`insert into attempts …`
 * + `count(*) where created_at > now() - interval '15 minutes'`) or Upstash —
 * the interface below would not change.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 5_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit = 8, windowSeconds = 300): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    // Opportunistic cleanup keeps the map from growing without bound in a
    // long-lived Node process (self-hosted / `next start`).
    if (buckets.size > MAX_TRACKED_KEYS) {
      for (const [existingKey, existingBucket] of buckets) {
        if (existingBucket.resetAt <= now) buckets.delete(existingKey);
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);
  return {
    allowed: bucket.count <= limit,
    remaining,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/** Clears a bucket after a successful login so a shared IP isn't punished. */
export function resetLimit(key: string): void {
  buckets.delete(key);
}
