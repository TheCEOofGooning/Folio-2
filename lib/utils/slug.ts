/** lib/utils/slug.ts — URL-safe identifiers for posts. */

import { randomBytes, toBase64Url } from '@/lib/auth/crypto';

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/g, '');
}

/**
 * `a-short-title-8f3kq` — readable, unique without a database round-trip, and
 * still backed by a unique index so a collision surfaces as a clean error
 * instead of silent data loss.
 */
export function uniqueSlug(title: string): string {
  const base = slugify(title) || 'untitled';
  const suffix = toBase64Url(randomBytes(4)).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'x1';
  return `${base}-${suffix}`;
}
