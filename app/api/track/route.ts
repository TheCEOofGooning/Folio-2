import { recordView } from '@/lib/db/queries/engage';
import { getPublishedPostBySlug } from '@/lib/db/queries/posts';
import { viewerKey } from '@/lib/auth/session';
import { rateLimitView } from '@/lib/utils/rate-limit';

export const dynamic = 'force-dynamic';

/** 1×1 transparent GIF — the smallest useful response body there is. */
const PIXEL = Uint8Array.from(
  atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
  (char) => char.charCodeAt(0),
);

const PIXEL_RESPONSE = {
  headers: {
    'content-type': 'image/gif',
    'cache-control': 'no-store, max-age=0',
    'content-length': String(PIXEL.byteLength),
  },
} as const;

/**
 * View beacon.
 *
 * A GET that returns a GIF is fired with `navigator.sendBeacon` (or an <img>),
 * so it never blocks navigation, never needs CORS, and costs the client no
 * JavaScript bundle beyond three lines. De-duplication happens in the database
 * via the (post, reader, day) unique constraint — see lib/db/queries/engage.ts.
 */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug) return new Response(PIXEL, PIXEL_RESPONSE);

  const key = await viewerKey(request);
  if (!rateLimitView(key).ok) return new Response(PIXEL, PIXEL_RESPONSE);

  const post = await getPublishedPostBySlug(slug);
  if (!post) return new Response(PIXEL, PIXEL_RESPONSE);

  await recordView(post.id, key);
  return new Response(PIXEL, PIXEL_RESPONSE);
}
