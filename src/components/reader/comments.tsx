"use client";

/**
 * Responses (comments).
 *
 * Loaded after the article, on demand. That ordering is deliberate: the article
 * body is the payload that matters and it comes from the CDN; the conversation is
 * dynamic, personal and much less latency-sensitive. Splitting them keeps the
 * static page static.
 *
 * Threading is one level deep. Two levels of nesting is a reply; five is an
 * argument nobody can follow.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/session-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { CommentIcon, TrashIcon } from "@/components/ui/icons";
import {
  commentAction,
  deleteCommentAction,
  listCommentsAction,
} from "@/server/actions/social";
import { cn, pluralize, relativeTime } from "@/lib/utils";
import type { CommentNode, CommentWithReplies } from "@/db/types";
import { MAX_COMMENT_LENGTH } from "@/lib/editor-types";

export function Comments({
  postId,
  initialCount,
  authorUsername,
}: {
  postId: string;
  initialCount: number;
  authorUsername: string;
}) {
  const { user, requireAuth } = useSession();
  const [threads, setThreads] = useState<CommentWithReplies[] | null>(null);
  const [count, setCount] = useState(initialCount);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    void listCommentsAction(postId).then((result) => {
      if (cancelled) return;
      setThreads(result.data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const submit = useCallback(
    async (parentId: string | null) => {
      if (!requireAuth("comment")) return;
      const body = draft.trim();
      if (body.length < 2) {
        setError("Say a little more than that.");
        return;
      }

      setBusy(true);
      setError(undefined);
      const result = await commentAction(postId, body, parentId);
      setBusy(false);

      if (!result.ok || !result.data) {
        setError(result.error ?? "Your comment didn't go through.");
        return;
      }

      // Optimistic insert with the author we already know, then reconcile.
      const optimistic: CommentNode = {
        id: result.data.id,
        body,
        parentId,
        edited: false,
        createdAt: result.data.createdAt,
        updatedAt: result.data.createdAt,
        author: {
          id: user!.id,
          username: user!.username,
          displayName: user!.displayName,
          avatarUrl: user!.avatarUrl,
          avatarHue: user!.avatarHue,
          bio: "",
          tagline: "",
        },
      };

      setThreads((current) => {
        const list = current ?? [];
        if (!parentId) return [{ ...optimistic, replies: [] }, ...list];
        return list.map((thread) =>
          thread.id === parentId
            ? { ...thread, replies: [...thread.replies, optimistic] }
            : thread,
        );
      });
      setCount(result.data.commentCount);
      setDraft("");
      setReplyTo(null);
    },
    [draft, postId, requireAuth, user],
  );

  const remove = useCallback(async (commentId: string, isReply: boolean, parentId: string | null) => {
    const result = await deleteCommentAction(commentId);
    if (!result.ok) return;
    setThreads((current) => {
      const list = current ?? [];
      if (!isReply) return list.filter((thread) => thread.id !== commentId);
      return list.map((thread) =>
        thread.id === parentId
          ? { ...thread, replies: thread.replies.filter((reply) => reply.id !== commentId) }
          : thread,
      );
    });
    setCount((value) => Math.max(0, value - 1));
  }, []);

  const heading = useMemo(
    () => (threads === null ? "Responses" : pluralize(count, "response")),
    [threads, count],
  );

  return (
    <section id="responses" className="mx-auto max-w-2xl scroll-mt-24 px-4 sm:px-6">
      <h2 className="font-display text-2xl tracking-[-0.02em] text-ink">{heading}</h2>

      {/* Composer */}
      <div className="mt-6 rounded-xl border border-line bg-paper-raised p-4">
        {user ? (
          <>
            <div className="flex gap-3">
              <Avatar user={user} size="sm" />
              <div className="min-w-0 flex-1">
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  maxLength={MAX_COMMENT_LENGTH}
                  placeholder={`What did you think? Be kind to ${authorUsername}.`}
                  className="min-h-20 border-0 bg-transparent p-0 focus:ring-0"
                  aria-label="Write a response"
                />
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-3">
              <span className="text-xs text-ink-faint">
                {draft.length > 0 ? `${draft.length}/${MAX_COMMENT_LENGTH}` : "Markdown works here."}
              </span>
              <div className="flex items-center gap-2">
                {replyTo ? (
                  <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)}>
                    Cancel reply
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="primary"
                  loading={busy}
                  onClick={() => void submit(replyTo?.id ?? null)}
                >
                  {replyTo ? `Reply to ${replyTo.name.split(" ")[0]}` : "Respond"}
                </Button>
              </div>
            </div>
            {error ? <p className="mt-2 text-[0.8125rem] text-danger">{error}</p> : null}
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">Sign in to join the conversation.</p>
            <Button size="sm" variant="primary" onClick={() => requireAuth("comment")}>
              <CommentIcon className="size-4" /> Respond
            </Button>
          </div>
        )}
      </div>

      {/* Thread list */}
      <div className="mt-8 space-y-8">
        {threads === null ? (
          <>
            <CommentSkeleton />
            <CommentSkeleton />
          </>
        ) : threads.length === 0 ? (
          <p className="py-6 text-sm text-ink-faint">
            No responses yet. Yours would be the first.
          </p>
        ) : (
          threads.map((thread) => (
            <article key={thread.id} className="space-y-5">
              <CommentRow
                comment={thread}
                canDelete={Boolean(user && (user.id === thread.author.id))}
                onDelete={() => void remove(thread.id, false, null)}
                onReply={() => {
                  if (!requireAuth("comment")) return;
                  setReplyTo({ id: thread.id, name: thread.author.displayName });
                }}
              />
              {thread.replies.length > 0 ? (
                <div className="ml-5 space-y-5 border-l border-line pl-5 sm:ml-6 sm:pl-6">
                  {thread.replies.map((reply) => (
                    <CommentRow
                      key={reply.id}
                      comment={reply}
                      canDelete={Boolean(user && user.id === reply.author.id)}
                      onDelete={() => void remove(reply.id, true, thread.id)}
                      compact
                    />
                  ))}
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function CommentRow({
  comment,
  canDelete,
  onDelete,
  onReply,
  compact = false,
}: {
  comment: CommentNode;
  canDelete: boolean;
  onDelete: () => void;
  onReply?: () => void;
  compact?: boolean;
}) {
  return (
    <div className="group flex gap-3">
      <Avatar user={comment.author} size={compact ? "xs" : "sm"} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <Link
            href={`/u/${comment.author.username}`}
            className="text-[0.8125rem] font-medium text-ink transition-opacity hover:opacity-75"
          >
            {comment.author.displayName}
          </Link>
          <time dateTime={comment.createdAt} className="text-xs text-ink-faint">
            {relativeTime(comment.createdAt)}
          </time>
        </div>
        <p className={cn("mt-1.5 whitespace-pre-wrap leading-relaxed text-ink-muted", compact ? "text-[0.9375rem]" : "text-[0.9375rem]")}>
          {comment.body}
        </p>
        <div className="mt-2 flex items-center gap-3 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {onReply ? (
            <button
              type="button"
              onClick={onReply}
              className="text-xs text-ink-faint transition-colors hover:text-ink"
            >
              Reply
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1 text-xs text-ink-faint transition-colors hover:text-danger"
            >
              <TrashIcon className="size-3" /> Delete
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CommentSkeleton() {
  return (
    <div className="flex gap-3">
      <Skeleton className="size-8 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
    </div>
  );
}
