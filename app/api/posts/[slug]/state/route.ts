import { getCurrentUser } from '@/lib/auth/session';
import { getPublishedPostBySlug } from '@/lib/db/queries/posts';
import { fail, json } from '@/lib/utils/api';

export const dynamic = 'force-dynamic';

/**
 * Personalisation for the prerendered reading page.
 *
 * /p/[slug] is ISR-cached and therefore rendered without a reader in scope;
 * this endpoint is what makes the clap and bookmark buttons reflect *your*
 * state without giving up the cache.
 */
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) return fail('Story not found.', 404);

  const user = await getCurrentUser();
  const withReader = user ? await getPublishedPostBySlug(slug, user.id) : null;

  return json({
    claps: post.clap_count,
    comments: post.comment_count,
    clapped: withReader?.clapped ?? false,
    bookmarked: withReader?.bookmarked ?? false,
    signedIn: Boolean(user),
  });
}
