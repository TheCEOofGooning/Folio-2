import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth/session';
import { addComment, listComments } from '@/lib/db/queries/engage';
import { getPublishedPostBySlug } from '@/lib/db/queries/posts';
import { fail, json, readJson, unauthorized } from '@/lib/utils/api';
import { rateLimit } from '@/lib/utils/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) return fail('Story not found.', 404);
  return json({ comments: await listComments(post.id) });
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const limited = rateLimit(`comment:${user.id}`, 10, 60_000);
  if (!limited.ok) return fail('You are commenting too quickly.', 429);

  const body = await readJson<{ body?: string; parentId?: number }>(request);
  const text = (body?.body ?? '').trim();
  if (text.length < 1) return fail('Write something first.');
  if (text.length > 2000) return fail('Comments are limited to 2000 characters.');

  const post = await getPublishedPostBySlug(slug);
  if (!post) return fail('Story not found.', 404);

  const comment = await addComment({ postId: post.id, userId: user.id, body: text, parentId: body?.parentId ?? null });
  if (!comment) return fail('Could not save your comment.', 500);

  revalidatePath(`/p/${slug}`);
  return json({ comment }, { status: 201 });
}
