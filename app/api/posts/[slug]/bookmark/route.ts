import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth/session';
import { toggleBookmark } from '@/lib/db/queries/engage';
import { getPublishedPostBySlug } from '@/lib/db/queries/posts';
import { fail, json, unauthorized } from '@/lib/utils/api';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const post = await getPublishedPostBySlug(slug);
  if (!post) return fail('Story not found.', 404);

  const bookmarked = await toggleBookmark(post.id, user.id);
  revalidatePath('/saved');
  return json({ bookmarked });
}
