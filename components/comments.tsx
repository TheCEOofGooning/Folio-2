'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { SendIcon, TrashIcon } from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/card';
import { formatRelative } from '@/lib/utils/format';
import type { CommentRow } from '@/lib/db/queries/types';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Comments. Rendered on the client so the ISR-cached article shell stays
 * cacheable: the conversation is the one part of the page that is genuinely
 * per-request and always changing.
 */
export function Comments({ slug }: { slug: string }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The article shell is prerendered, so the reader is resolved here.
  useEffect(() => {
    let active = true;
    fetch('/api/me', { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { user: SessionUser | null } | null) => active && setUser(data?.user ?? null))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`/api/posts/${slug}/comments`, { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { comments: CommentRow[] } | null) => active && setComments(data?.comments ?? []))
      .catch(() => active && setComments([]));
    return () => {
      active = false;
    };
  }, [slug]);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const body = draft.trim();
      if (!body) return;
      setSending(true);
      setError(null);
      try {
        const response = await fetch(`/api/posts/${slug}/comments`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ body, parentId: replyTo }),
        });
        const data = (await response.json()) as { comment?: CommentRow; error?: string };
        if (!response.ok || !data.comment) throw new Error(data.error ?? 'Could not post your comment.');
        setComments((previous) => [...(previous ?? []), data.comment as CommentRow]);
        setDraft('');
        setReplyTo(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Something went wrong.');
      } finally {
        setSending(false);
      }
    },
    [draft, replyTo, slug],
  );

  const remove = useCallback(
    async (id: number) => {
      const previous = comments;
      setComments((list) => (list ?? []).filter((comment) => comment.id !== id && comment.parent_id !== id));
      const response = await fetch(`/api/posts/${slug}/comments/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!response.ok) setComments(previous);
    },
    [comments, slug],
  );

  const roots = (comments ?? []).filter((comment) => !comment.parent_id);
  const repliesFor = (id: number) => (comments ?? []).filter((comment) => comment.parent_id === id);

  const renderComment = (comment: CommentRow, depth: number) => (
    <motion.li
      key={comment.id}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className={depth > 0 ? 'ml-6 border-l border-line pl-5 sm:ml-11' : ''}
    >
      <div className="flex gap-3 py-4">
        <Link href={`/${comment.username}`} className="mt-0.5">
          <Avatar name={comment.display_name} username={comment.username} src={comment.avatar_url} size="sm" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <Link href={`/${comment.username}`} className="font-medium text-ink hover:text-accent">
              {comment.display_name}
            </Link>
            <time className="text-muted" dateTime={new Date(comment.created_at).toISOString()}>
              {formatRelative(comment.created_at)}
            </time>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-ink/90">{comment.body}</p>
          <div className="mt-1.5 flex items-center gap-3 text-[13px]">
            {user && depth === 0 ? (
              <button
                type="button"
                onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                className="text-muted transition-colors hover:text-accent"
              >
                {replyTo === comment.id ? 'Cancel reply' : 'Reply'}
              </button>
            ) : null}
            {user && user.id === comment.user_id ? (
              <button
                type="button"
                onClick={() => remove(comment.id)}
                className="inline-flex items-center gap-1 text-muted transition-colors hover:text-red-500"
              >
                <TrashIcon size={13} /> Delete
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {repliesFor(comment.id).length ? (
        <ul>{repliesFor(comment.id).map((reply) => renderComment(reply, depth + 1))}</ul>
      ) : null}
    </motion.li>
  );

  return (
    <section id="comments" className="mt-14 scroll-mt-24">
      <h2 className="font-serif text-2xl tracking-tight text-ink">
        {comments === null ? 'Responses' : `${comments.length} ${comments.length === 1 ? 'response' : 'responses'}`}
      </h2>

      <div className="mt-6">
        {user ? (
          <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex gap-3">
              <Avatar name={user.display_name} username={user.username} src={user.avatar_url} size="sm" />
              <div className="min-w-0 flex-1">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder={replyTo ? 'Write a reply…' : 'What did you think?'}
                  className="w-full resize-y rounded-xl border border-line bg-bg p-3 text-[15px] text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-[13px] text-muted">
                    {error ? <span className="text-red-500">{error}</span> : `${draft.length}/2000`}
                  </p>
                  <Button type="submit" size="sm" disabled={sending || !draft.trim()}>
                    {sending ? <Spinner className="h-4 w-4" /> : <SendIcon size={15} />}
                    {replyTo ? 'Reply' : 'Respond'}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        ) : (
          <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            <Link href={`/login?next=/p/${slug}`} className="text-accent hover:underline">
              Sign in
            </Link>{' '}
            to join the conversation.
          </p>
        )}
      </div>

      {comments === null ? (
        <div className="space-y-4 py-6">
          <Spinner className="text-muted" />
        </div>
      ) : comments.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No responses yet. Be the first.</p>
      ) : (
        <ul className="divide-y divide-line">
          <AnimatePresence initial={false}>{roots.map((comment) => renderComment(comment, 0))}</AnimatePresence>
        </ul>
      )}
    </section>
  );
}
