import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Editor, type EditorPost } from '@/components/editor';
import { getCurrentUser } from '@/lib/auth/session';
import { getOwnPostBySlug } from '@/lib/db/queries/posts';

export const metadata: Metadata = { title: 'Write', robots: { index: false } };

const EMPTY: EditorPost = { title: '', subtitle: '', coverUrl: '', tags: [], content: '' };

export default async function WritePage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; welcome?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/write');

  const { edit, welcome } = await searchParams;
  let post = EMPTY;

  if (edit) {
    const existing = await getOwnPostBySlug(edit, user.id);
    if (!existing) notFound();
    post = {
      id: existing.id,
      slug: existing.slug,
      title: existing.title,
      subtitle: existing.subtitle ?? '',
      coverUrl: existing.cover_url ?? '',
      tags: existing.tags ?? [],
      content: existing.content,
      status: existing.status,
    };
  }

  return <Editor post={post} welcome={welcome === '1'} />;
}
