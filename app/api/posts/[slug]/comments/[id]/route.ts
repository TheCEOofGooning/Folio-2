import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth/session';
import { deleteComment } from '@/lib/db/queries/engage';
import { fail, json, unauthorized } from '@/lib/utils/api';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const commentId = Number(id);
  if (!Number.isInteger(commentId)) return fail('Invalid comment.');

  await deleteComment(commentId, user.id);
  revalidatePath(`/p/${slug}`);
  return json({ ok: true });
}
