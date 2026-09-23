'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { BookmarkIcon, ClapIcon, CommentIcon } from '@/components/icons';
import { cn } from '@/lib/utils/cn';
import { formatCount } from '@/lib/utils/format';

interface State {
  claps: number;
  clapped: boolean;
  bookmarked: boolean;
  comments: number;
  signedIn: boolean;
}

/**
 * The reading page is prerendered, so reader-specific state arrives from
 * /api/posts/[slug]/state and every mutation is optimistic: the number moves
 * immediately and rolls back only if the request fails.
 */
export function PostInteractions({ slug, initialClaps, initialComments }: { slug: string; initialClaps: number; initialComments: number }) {
  const [state, setState] = useState<State>({
    claps: initialClaps,
    clapped: false,
    bookmarked: false,
    comments: initialComments,
    signedIn: false,
  });
  const [burst, setBurst] = useState(0);
  const [pendingClap, setPendingClap] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/posts/${slug}/state`, { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: State | null) => {
        if (data && active) setState((previous) => ({ ...previous, ...data }));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [slug]);

  const clap = useCallback(async () => {
    if (!state.signedIn) {
      window.location.href = `/login?next=/p/${slug}`;
      return;
    }
    const previous = state;
    const removing = state.clapped;
    setPendingClap(true);
    setState((s) => ({ ...s, clapped: !removing, claps: removing ? Math.max(s.claps - 1, 0) : s.claps + 1 }));
    if (!removing) setBurst((n) => n + 1);

    try {
      const response = await fetch(`/api/posts/${slug}/clap`, {
        method: removing ? 'DELETE' : 'POST',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('clap failed');
      const data = (await response.json()) as { claps: number; clapped: boolean };
      setState((s) => ({ ...s, claps: data.claps, clapped: data.clapped }));
    } catch {
      setState(previous);
    } finally {
      setPendingClap(false);
    }
  }, [slug, state]);

  const bookmark = useCallback(async () => {
    if (!state.signedIn) {
      window.location.href = `/login?next=/p/${slug}`;
      return;
    }
    const previous = state;
    setState((s) => ({ ...s, bookmarked: !s.bookmarked }));
    try {
      const response = await fetch(`/api/posts/${slug}/bookmark`, { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error('bookmark failed');
      const data = (await response.json()) as { bookmarked: boolean };
      setState((s) => ({ ...s, bookmarked: data.bookmarked }));
    } catch {
      setState(previous);
    }
  }, [slug, state]);

  return (
    <div className="mt-10 flex flex-wrap items-center gap-2.5 border-t border-line pt-8">
      <motion.button
        type="button"
        onClick={clap}
        disabled={pendingClap}
        aria-pressed={state.clapped}
        aria-label={state.clapped ? 'Remove your clap' : 'Clap for this story'}
        whileTap={{ scale: 0.92 }}
        className={cn(
          'relative inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
          state.clapped
            ? 'border-accent/40 bg-accent-soft text-accent'
            : 'border-line bg-surface text-muted hover:border-accent/40 hover:text-ink',
        )}
      >
        <ClapIcon size={18} />
        <span className="tabular-nums">{formatCount(state.claps)}</span>

        <AnimatePresence>
          {burst ? (
            <motion.span
              key={burst}
              aria-hidden="true"
              initial={{ opacity: 0.9, scale: 0.4 }}
              animate={{ opacity: 0, scale: 1.8 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="pointer-events-none absolute inset-0 rounded-full border-2 border-accent"
            />
          ) : null}
        </AnimatePresence>
      </motion.button>

      <motion.button
        type="button"
        onClick={bookmark}
        aria-pressed={state.bookmarked}
        aria-label={state.bookmarked ? 'Remove from saved' : 'Save for later'}
        whileTap={{ scale: 0.92 }}
        className={cn(
          'inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
          state.bookmarked
            ? 'border-accent/40 bg-accent-soft text-accent'
            : 'border-line bg-surface text-muted hover:border-accent/40 hover:text-ink',
        )}
      >
        <BookmarkIcon size={18} fill={state.bookmarked ? 'currentColor' : 'none'} />
        {state.bookmarked ? 'Saved' : 'Save'}
      </motion.button>

      <a
        href="#comments"
        className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium text-muted transition-colors hover:border-accent/40 hover:text-ink"
      >
        <CommentIcon size={18} />
        <span className="tabular-nums">{formatCount(state.comments)}</span>
      </a>

      {!state.signedIn ? (
        <span className="ml-auto text-sm text-muted">
          <Link href={`/login?next=/p/${slug}`} className="text-accent hover:underline">
            Sign in
          </Link>{' '}
          to clap or save
        </span>
      ) : null}
    </div>
  );
}
