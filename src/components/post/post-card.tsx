import Link from "next/link";
import { Cover } from "./cover";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/misc";
import { ClapIcon, CommentIcon, ClockIcon, EyeIcon } from "@/components/ui/icons";
import { cn, formatNumber, relativeTime } from "@/lib/utils";
import type { PostCard as PostCardData } from "@/db/types";

/**
 * Post card — a server component with no client JavaScript.
 *
 * This is the unit of the entire product and it appears on every surface: home,
 * explore, search, profiles, library. It is deliberately not interactive: there
 * is no like button, no hover menu, no bookmark toggle. Every one of those would
 * turn a cached, static page into a dynamic one, and none of them belong in a
 * preview — they belong in the story.
 *
 * Hover and focus states are pure CSS, so 30 cards on a page cost zero JS.
 */
export function PostCard({
  post,
  variant = "card",
  priority = false,
  className,
}: {
  post: PostCardData;
  /** `feature` = hero with large cover, `card` = grid unit, `row` = dense list line. */
  variant?: "feature" | "card" | "row";
  priority?: boolean;
  className?: string;
}) {
  const href = `/p/${post.slug}`;

  if (variant === "row") {
    return (
      <article className={cn("group relative flex items-baseline gap-4 py-5", className)}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem] text-ink-faint">
            <Link href={`/u/${post.author.username}`} className="font-medium text-ink-muted hover:text-ink">
              {post.author.displayName}
            </Link>
            <span aria-hidden>·</span>
            <time dateTime={post.publishedAt ?? post.createdAt}>{relativeTime(post.publishedAt ?? post.createdAt)}</time>
            <span aria-hidden>·</span>
            <span>{post.readingMinutes} min read</span>
          </div>
          <h3 className="mt-1.5 font-display text-xl leading-snug tracking-[-0.02em] text-ink">
            <Link href={href} className="transition-opacity hover:opacity-70">
              <span className="absolute inset-0" aria-hidden />
              {post.title}
            </Link>
          </h3>
          {post.excerpt ? (
            <p className="mt-1.5 line-clamp-2 text-[0.9375rem] leading-relaxed text-ink-muted">{post.excerpt}</p>
          ) : null}
        </div>
        <div className="hidden shrink-0 items-center gap-3 text-xs text-ink-faint sm:flex">
          <Metric icon={<ClapIcon className="size-3.5" />} value={post.clapCount} label="claps" />
          <Metric icon={<CommentIcon className="size-3.5" />} value={post.commentCount} label="comments" />
        </div>
      </article>
    );
  }

  const feature = variant === "feature";

  return (
    <article className={cn("group relative flex flex-col", className)}>
      <div className={cn("flex gap-5", feature && "flex-col gap-6")}>
        {feature ? (
          <Cover
            image={post.coverImage}
            preset={post.coverPreset}
            title={post.title}
            priority={priority}
            className="aspect-[16/9] w-full rounded-xl"
            sizes="(max-width: 1024px) 100vw, 720px"
          />
        ) : null}

        <div className={cn("flex min-w-0 flex-1 flex-col", !feature && "gap-4 sm:flex-row-reverse sm:gap-6")}>
          {!feature ? (
            <Cover
              image={post.coverImage}
              preset={post.coverPreset}
              title={post.title}
              priority={priority}
              className="aspect-[16/10] w-full rounded-lg sm:aspect-square sm:w-40 sm:shrink-0 lg:w-48"
              sizes="(max-width: 640px) 100vw, 200px"
            />
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2.5">
              <Avatar user={post.author} size="xs" />
              <Link
                href={`/u/${post.author.username}`}
                className="relative z-10 text-[0.8125rem] font-medium text-ink transition-opacity hover:opacity-75"
              >
                {post.author.displayName}
              </Link>
              <span className="text-[0.8125rem] text-ink-faint" aria-hidden>
                ·
              </span>
              <time
                dateTime={post.publishedAt ?? post.createdAt}
                className="text-[0.8125rem] text-ink-faint"
              >
                {relativeTime(post.publishedAt ?? post.createdAt)}
              </time>
              {post.status === "draft" ? <Badge tone="draft">Draft</Badge> : null}
              {post.featured && post.status === "published" ? <Badge tone="accent">Featured</Badge> : null}
            </div>

            <h2
              className={cn(
                "mt-3 font-display leading-[1.15] tracking-[-0.022em] text-ink",
                feature ? "text-3xl sm:text-4xl" : "text-[1.375rem]",
              )}
            >
              <Link href={href} className="transition-opacity hover:opacity-70">
                {/* Full-card click target without nesting links inside links. */}
                <span className="absolute inset-0" aria-hidden />
                {post.title}
              </Link>
            </h2>

            {feature && post.subtitle ? (
              <p className="mt-3 text-lg leading-relaxed text-ink-muted">{post.subtitle}</p>
            ) : null}

            {!feature && post.excerpt ? (
              <p className="mt-2 line-clamp-2 text-[0.9375rem] leading-relaxed text-ink-muted">{post.excerpt}</p>
            ) : null}

            <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4 text-xs text-ink-faint">
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon className="size-3.5" />
                {post.readingMinutes} min
              </span>
              <Metric icon={<ClapIcon className="size-3.5" />} value={post.clapCount} label="claps" />
              {post.commentCount > 0 ? (
                <Metric icon={<CommentIcon className="size-3.5" />} value={post.commentCount} label="comments" />
              ) : null}
              {feature ? (
                <Metric icon={<EyeIcon className="size-3.5" />} value={post.viewCount} label="reads" />
              ) : null}

              {post.tags.length > 0 ? (
                <span className="ml-auto hidden flex-wrap gap-1.5 sm:flex">
                  {post.tags.slice(0, 2).map((tag) => (
                    <Link
                      key={tag}
                      href={`/explore?tag=${encodeURIComponent(tag)}`}
                      className="relative z-10 rounded-full border border-line px-2.5 py-0.5 transition-colors hover:border-line-strong hover:text-ink-muted"
                    >
                      {tag}
                    </Link>
                  ))}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1.5" title={`${value} ${label}`}>
      {icon}
      {formatNumber(value)}
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
