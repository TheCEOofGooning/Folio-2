'use server';

/**
 * lib/actions/posts.ts — the creator suite's mutations.
 *
 * Every action re-checks ownership against the database; the editor's `id`
 * comes from the client and is never trusted.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { readSessionUserId } from '@/lib/auth/session';
import {
  createDraft,
  deletePost,
  getPostById,
  publishPost,
  unpublishPost,
  updatePost,
} from '@/lib/db/queries/posts';
import { countWords, excerptFrom, markdownToHtml, readMinutes } from '@/lib/utils/markdown';
import { uniqueSlug } from '@/lib/utils/slug';

export interface SaveDraftInput {
  id?: number | null;
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  tags: string[];
  content: string;
}

export interface SaveDraftResult {
  ok: boolean;
  id?: number;
  slug?: string;
  error?: string;
}

/** Guards an action that operates on an existing post. */
async function requireOwnPost(id: number): Promise<{ authorId: number; slug: string } | null> {
  const userId = await readSessionUserId();
  if (!userId) return null;
  const post = await getPostById(id);
  if (!post || post.author_id !== userId) return null;
  return { authorId: userId, slug: post.slug };
}

export async function saveDraftAction(input: SaveDraftInput): Promise<SaveDraftResult> {
  const userId = await readSessionUserId();
  if (!userId) return { ok: false, error: 'Your session expired — sign in again.' };

  const title = input.title.trim() || 'Untitled';
  if (title.length > 140) return { ok: false, error: 'Titles are limited to 140 characters.' };
  if (input.content.length > 200_000) return { ok: false, error: 'That story is too long (200k character limit).' };

  const html = markdownToHtml(input.content);
  const shared = {
    title,
    subtitle: input.subtitle?.trim() || null,
    content: input.content,
    contentHtml: html,
    excerpt: excerptFrom(input.content),
    coverUrl: input.coverUrl?.trim() || null,
    tags: input.tags ?? [],
    wordCount: countWords(input.content),
    readMinutes: readMinutes(input.content),
  };

  if (input.id) {
    const owned = await requireOwnPost(input.id);
    if (!owned) return { ok: false, error: 'You do not have access to that story.' };
    await updatePost({ id: input.id, ...shared });
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/posts');
    return { ok: true, id: input.id, slug: owned.slug };
  }

  const created = await createDraft({ authorId: userId, slug: uniqueSlug(title), ...shared });
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/posts');
  return { ok: true, id: created.id, slug: created.slug };
}

export async function publishAction(id: number): Promise<SaveDraftResult> {
  const owned = await requireOwnPost(id);
  if (!owned) return { ok: false, error: 'You do not have access to that story.' };

  const post = await getPostById(id);
  if (!post) return { ok: false, error: 'Story not found.' };
  if (!post.content.trim()) return { ok: false, error: 'Add some words before publishing.' };

  await publishPost(id);
  revalidatePath(`/p/${owned.slug}`);
  revalidatePath('/');
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/posts');
  return { ok: true, id, slug: owned.slug };
}

export async function unpublishAction(id: number): Promise<SaveDraftResult> {
  const owned = await requireOwnPost(id);
  if (!owned) return { ok: false, error: 'You do not have access to that story.' };
  await unpublishPost(id);
  revalidatePath(`/p/${owned.slug}`);
  revalidatePath('/');
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/posts');
  return { ok: true, id, slug: owned.slug };
}

export async function deleteAction(id: number): Promise<void> {
  const owned = await requireOwnPost(id);
  if (owned) {
    await deletePost(id);
    revalidatePath('/');
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/posts');
  }
  redirect('/dashboard/posts');
}
