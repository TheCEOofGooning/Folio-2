import Image from 'next/image';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { TagPill } from '@/components/ui/badge';
import { ClapIcon, ClockIcon, CommentIcon, EyeIcon } from '@/components/icons';
import { formatCount, formatMinutes, formatRelative } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { PostCard as PostCardData } from '@/lib/db/queries/types';

/**
 * A feed row. Pure server component — zero client JavaScript, which is why the
 * feed can be a wall of cards and still ship almost nothing to the browser.
 */
export function PostCard({
  post,
  featured = false,
}: {
  post: PostCardData;
  featured?: boolean;
}) {
  const href = `/p/${post.slug}`;
  const tags = (post.tags ?? []).slice(0, 3);

  return (
    <article
      className={cn(
        'group relative flex gap-5 border-b border-line/70 py-6 last:border-b-0',
        featured && 'flex-col-reverse gap-6 sm:flex-row',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-2.5 flex items-center gap-2 text-[13px] text-muted">
          <Link href={`/${post.username}`} className="flex items-center gap-2 hover:text-ink">
            <Avatar name={post.display_name} username={post.username} src={post.avatar_url} size="xs" />
            <span className="font-medium text-ink/80">{post.display_name}</span>
          </Link>
          <span aria-hidden="true">·</span>
          <time dateTime={post.published_at?.toISOString() ?? post.created_at.toISOString()}>
            {formatRelative(post.published_at ?? post.created_at)}
          </time>
        </div>

        <h3
          className={cn(
            'font-serif font-semibold tracking-tight text-ink transition-colors group-hover:text-accent',
            featured ? 'text-3xl leading-tight sm:text-4xl' : 'text-xl leading-snug',
          )}
        >
          <Link href={href} className="after:absolute after:inset-0 after:content-['']">
            {post.title}
          </Link>
        </h3>

        {post.subtitle || post.excerpt ? (
          <p
            className={cn(
              'mt-2 line-clamp-2 text-[15px] leading-relaxed text-muted',
              featured && 'line-clamp-3 text-base',
            )}
          >
            {post.subtitle ?? post.excerpt}
          </p>
        ) : null}

        {tags.length ? (
          <div className="relative z-10 mt-3.5 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <TagPill key={tag} tag={tag} />
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <ClockIcon size={14} />
            {formatMinutes(post.read_minutes)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <EyeIcon size={14} />
            {formatCount(post.view_count)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ClapIcon size={14} />
            {formatCount(post.clap_count)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CommentIcon size={14} />
            {formatCount(post.comment_count)}
          </span>
        </div>
      </div>

      {post.cover_url ? (
        <Link
          href={href}
          tabIndex={-1}
          aria-hidden="true"
          className={cn(
            'relative hidden shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2 sm:block',
            featured ? 'h-56 w-full sm:h-44 sm:w-72' : 'h-28 w-40',
          )}
        >
          <Image
            src={post.cover_url}
            alt=""
            fill
            sizes={featured ? '(max-width: 640px) 100vw, 288px' : '160px'}
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        </Link>
      ) : null}
    </article>
  );
}
