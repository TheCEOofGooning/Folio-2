"use client";

/**
 * Clap, bookmark, share, follow — the interactive layer of an otherwise static page.
 *
 * Behaviour, and why:
 *  • **Claps are optimistic and absolute.** The reader's total (1–50) is applied
 *    locally, animated immediately, then synced on a 600 ms debounce. The server
 *    action receives the *absolute* count, so a retry or a double-fire can never
 *    double-count — the upsert is idempotent by construction.
 *  • **Signed-out readers get the dialog, not a redirect.** Tapping clap opens
 *    in-context sign-in; the intent survives.
 *  • **State is fetched only for signed-in readers.** Anonymous readers — most of
 *    the traffic — make zero extra requests and see a cached page.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/session-provider";
import { AnimatePresence, m, useReducedMotion } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { BookmarkIcon, CheckIcon, ClapIcon, ShareIcon } from "@/components/ui/icons";
import { bookmarkAction, clapAction, followAction, getEngagementAction } from "@/server/actions/social";
import { cn, formatNumber, pluralize } from "@/lib/utils";

const MAX_CLAPS = 50;

interface Props {
  postId: string;
  slug: string;
  title: string;
  authorUsername: string;
  authorName: string;
  /** Server-rendered counters — correct for everyone, personalised after mount. */
  initialClaps: number;
  initialComments: number;
  initialViews: number;
}

export function ArticleActions({
  postId,
  slug,
  title,
  authorUsername,
  authorName,
  initialClaps,
  initialComments,
  initialViews,
}: Props) {
  const { user, requireAuth } = useSession();
  const reduceMotion = useReducedMotion();

  const [claps, setClaps] = useState(initialClaps);
  const [yourClaps, setYourClaps] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [following, setFollowing] = useState(false);
  const [comments] = useState(initialComments);
  const [views, setViews] = useState(initialViews);
  const [bursts, setBursts] = useState<number[]>([]);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);

  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestTotal = useRef(0);

  // One request, only for signed-in readers, to learn their own clap/bookmark state.
  useEffect(() => {
    if (!user) {
      setYourClaps(0);
      setBookmarked(false);
      setFollowing(false);
      return;
    }
    let cancelled = false;
    void getEngagementAction(postId).then((result) => {
      if (cancelled || !result.ok || !result.data) return;
      setClaps(result.data.claps);
      setViews(result.data.views);
      setYourClaps(result.data.yourClaps);
      setBookmarked(result.data.bookmarked);
      setFollowing(result.data.followingAuthor);
    });
    return () => {
      cancelled = true;
    };
  }, [user, postId]);

  // Live view count from the telemetry island (it owns the heartbeat).
  useEffect(() => {
    const onView = (event: Event) => {
      const detail = (event as CustomEvent<{ viewCount: number | null }>).detail;
      if (typeof detail?.viewCount === "number") setViews(detail.viewCount);
    };
    window.addEventListener("folio:views", onView);
    return () => window.removeEventListener("folio:views", onView);
  }, []);

  const flushClaps = useCallback(
    async (total: number) => {
      const result = await clapAction(postId, total);
      if (!result.ok) {
        if (result.requiresAuth) {
          // Roll back the optimistic UI; the dialog explains why.
          setYourClaps(0);
          setClaps(initialClaps);
        }
        return;
      }
      if (result.data) {
        setClaps(result.data.clapCount);
        setYourClaps(result.data.yourClaps);
      }
    },
    [postId, initialClaps],
  );

  const clap = useCallback(() => {
    if (!requireAuth("clap")) return;
    if (yourClaps >= MAX_CLAPS) return;

    const nextTotal = yourClaps + 1;
    setYourClaps(nextTotal);
    setClaps((current) => current + 1);
    latestTotal.current = nextTotal;

    // Floating "+1" particle, keyed so several can coexist.
    const id = Date.now() + Math.random();
    setBursts((current) => [...current.slice(-4), id]);
    setTimeout(() => setBursts((current) => current.filter((item) => item !== id)), 900);

    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void flushClaps(latestTotal.current), 600);
  }, [yourClaps, requireAuth, flushClaps]);

  // Ensure the last clap is never lost when the reader navigates away mid-burst.
  useEffect(() => {
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      if (latestTotal.current > 0) void flushClaps(latestTotal.current);
    };
  }, [flushClaps]);

  const bookmark = useCallback(async () => {
    if (!requireAuth("bookmark")) return;
    setBookmarked((value) => !value);
    setPending(true);
    const result = await bookmarkAction(postId);
    setPending(false);
    if (result.ok && result.data) setBookmarked(result.data.bookmarked);
  }, [requireAuth, postId]);

  const follow = useCallback(async () => {
    if (!requireAuth("follow")) return;
    setFollowing((value) => !value);
    const result = await followAction(authorUsername);
    if (result.ok && result.data) setFollowing(result.data.following);
  }, [requireAuth, authorUsername]);

  const share = useCallback(async () => {
    const url = `${window.location.origin}/p/${slug}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the reader dismissed the share sheet */
    }
  }, [slug, title]);

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      {/* Clap — the only button with a personality */}
      <div className="relative">
        <button
          type="button"
          onClick={clap}
          disabled={yourClaps >= MAX_CLAPS}
          aria-label={
            yourClaps > 0
              ? `Clap for ${title}. You have clapped ${yourClaps} time${yourClaps === 1 ? "" : "s"}.`
              : `Clap for ${title}`
          }
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm transition-all duration-150",
            "active:scale-[0.97] disabled:opacity-60",
            yourClaps > 0
              ? "border-clap/40 bg-clap-soft text-clap"
              : "border-line bg-paper-raised text-ink-muted hover:border-clap/40 hover:text-clap",
          )}
        >
          <m.span
            key={yourClaps}
            initial={reduceMotion ? false : { scale: 0.7, y: 4 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 18 }}
            className="inline-flex"
          >
            <ClapIcon className="size-4.5" />
          </m.span>
          <span className="font-medium tabular-nums">{formatNumber(claps)}</span>
          {yourClaps > 0 ? <span className="text-2xs opacity-70">+{yourClaps}</span> : null}
        </button>

        <AnimatePresence>
          {bursts.map((id, index) => (
            <m.span
              key={id}
              aria-hidden
              initial={{ opacity: 0.9, y: 0, x: 0, scale: 0.8 }}
              animate={{ opacity: 0, y: -34, x: (index % 2 === 0 ? 1 : -1) * (6 + index * 4), scale: 1.05 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.85, ease: "easeOut" }}
              className="pointer-events-none absolute left-4 top-0 select-none text-sm font-semibold text-clap"
            >
              +1
            </m.span>
          ))}
        </AnimatePresence>
      </div>

      <ActionButton
        active={bookmarked}
        onClick={() => void bookmark()}
        disabled={pending}
        label={bookmarked ? "Remove from library" : "Save to library"}
        icon={<BookmarkIcon className="size-4.5" filled={bookmarked} />}
      >
        {bookmarked ? "Saved" : "Save"}
      </ActionButton>

      <ActionButton
        onClick={() => void share()}
        label="Share this story"
        icon={copied ? <CheckIcon className="size-4.5 text-success" /> : <ShareIcon className="size-4.5" />}
      >
        {copied ? "Link copied" : "Share"}
      </ActionButton>

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-[0.8125rem] text-ink-faint sm:inline">
          {pluralize(comments, "response")} · {formatNumber(views)} reads
        </span>
        <Button
          size="sm"
          variant={following ? "secondary" : "primary"}
          onClick={() => void follow()}
          className="shrink-0"
        >
          {following ? "Following" : `Follow ${authorName.split(" ")[0]}`}
        </Button>
      </div>
    </div>
  );
}

function ActionButton({
  active = false,
  children,
  icon,
  label,
  ...props
}: {
  active?: boolean;
  children: React.ReactNode;
  icon: React.ReactNode;
  label: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm transition-all duration-150 active:scale-[0.97]",
        active
          ? "border-accent/35 bg-accent-soft text-accent"
          : "border-line bg-paper-raised text-ink-muted hover:border-line-strong hover:text-ink",
        "disabled:opacity-60",
      )}
      {...props}
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </button>
  );
}
