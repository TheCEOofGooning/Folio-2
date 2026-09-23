import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth/session';
import { addClap, getReaderClaps, removeClaps } from '@/lib/db/queries/engage';
import { getPublishedPostBySlug } from '@/lib/db/queries/posts';
import { fail, json, unauthorized } from '@/lib/utils/api';
import { rateLimit } from '@/lib/utils/rate-limit';

export const dynamic = 'force-dynamic';

async function resolve(slug: string) {
  const post = await getPublishedPostBySlug(slug);
  if (!post) return null;
  return post;
}

export async function POST(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const limited = rateLimit(`clap:${user.id}`, 30, 60_000);
  if (!limited.ok) return fail('Slow down — you are clapping too fast.', 429);

  const post = await resolve(slug);
  if (!post) return fail('Story not found.', 404);

  const claps = await addClap(post.id, user.id);
  revalidatePath(`/p/${slug}`);
  return json({ claps, mine: await getReaderClaps(post.id, user.id), clapped: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const post = await resolve(slug);
  if (!post) return fail('Story not found.', 404);

  const claps = await removeClaps(post.id, user.id);
  revalidatePath(`/p/${slug}`);
  return json({ claps, mine: 0, clapped: false });
}
