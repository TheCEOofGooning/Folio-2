'use client';

import * as Dialog from '@radix-ui/react-dialog';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { deleteAction, publishAction, unpublishAction } from '@/lib/actions/posts';
import { ClapIcon, CommentIcon, EyeIcon, PenIcon, TrashIcon } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClass } from '@/components/ui/button';
import { Spinner } from '@/components/ui/card';
import { formatCount, formatRelative } from '@/lib/utils/format';
import type { CreatorPostRow } from '@/lib/db/queries/types';

export function PostManager({ posts }: { posts: CreatorPostRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CreatorPostRow | null>(null);

  const run = (id: number, action: () => Promise<unknown>) => {
    setBusyId(id);
    startTransition(async () => {
      await action();
      router.refresh();
      setBusyId(null);
    });
  };

  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        <AnimatePresence initial={false}>
          {posts.map((post) => (
            <motion.li
              key={post.id}
              layout
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap items-center gap-4 px-5 py-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {post.status === 'published' ? (
                    <Link href={`/p/${post.slug}`} className="truncate font-medium text-ink hover:text-accent">
                      {post.title}
                    </Link>
                  ) : (
                    <span className="truncate font-medium text-ink">{post.title}</span>
                  )}
                  <Badge tone={post.status === 'published' ? 'success' : 'warning'}>{post.status}</Badge>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                  <span>Edited {formatRelative(post.updated_at)}</span>
                  <span className="inline-flex items-center gap-1">
                    <EyeIcon size={13} /> {formatCount(post.view_count)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ClapIcon size={13} /> {formatCount(post.clap_count)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CommentIcon size={13} /> {formatCount(post.comment_count)}
                  </span>
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <Link href={`/write?edit=${post.slug}`} className={buttonClass('ghost', 'sm')} aria-label="Edit">
                  <PenIcon size={15} /> Edit
                </Link>
                {post.status === 'published' ? (
                  <>
                    <Link href={`/p/${post.slug}`} className={buttonClass('ghost', 'sm')}>
                      View
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending || busyId === post.id}
                      onClick={() => run(post.id, () => unpublishAction(post.id))}
                    >
                      Unpublish
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pending || busyId === post.id}
                    onClick={() => run(post.id, () => publishAction(post.id))}
                  >
                    {busyId === post.id ? <Spinner className="h-3.5 w-3.5" /> : null}
                    Publish
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmDelete(post)}
                  aria-label={`Delete ${post.title}`}
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
                >
                  <TrashIcon size={15} />
                </button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <Dialog.Root open={Boolean(confirmDelete)} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-6 shadow-card">
            <Dialog.Title className="font-serif text-xl text-ink">Delete this story?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted">
              “{confirmDelete?.title}” and its claps, comments and analytics will be removed permanently. This cannot
              be undone.
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close className={buttonClass('ghost', 'sm')}>Cancel</Dialog.Close>
              <Dialog.Close
                className={buttonClass('danger', 'sm')}
                onClick={() => confirmDelete && startTransition(() => deleteAction(confirmDelete.id))}
              >
                {pending ? <Spinner className="h-3.5 w-3.5" /> : <TrashIcon size={15} />}
                Delete forever
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
