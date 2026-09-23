import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Comments } from '@/components/comments';
import { PostInteractions } from '@/components/post-interactions';
import { PostCard } from '@/components/post-card';
import { ReadingProgress } from '@/components/reading-progress';
import { ReadingToolbar } from '@/components/reading-toolbar';
import { ViewTracker } from '@/components/view-tracker';
import { ArrowLeftIcon, ClapIcon, EyeIcon } from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';
import { TagPill } from '@/components/ui/badge';
import { formatCount, formatDate, formatMinutes } from '@/lib/utils/format';
import { getPublishedPostBySlug, getRelatedPosts, listPosts } from '@/lib/db/queries/posts';

/**
 * Incremental Static Regeneration.
 *
 * The reading page is the hottest route on the site and it renders no
 * per-reader data, so it is prerendered and revalidated in the background.
 * Publishing or editing calls `revalidatePath('/p/<slug>')`, which makes an
 * edit visible immediately instead of after the interval.
 */
export const revalidate = 60;

export async function generateStaticParams() {
  // Warm the cache with the newest stories at build time; everything else is
  // generated on first request (dynamicParams defaults to true).
  const posts = await listPosts({ status: 'published', limit: 20 });
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) return { title: 'Story not found', robots: { index: false, follow: false } };

  const description = post.subtitle ?? post.excerpt ?? `${post.title} by ${post.display_name}`;
  return {
    title: post.title,
    description,
    authors: [{ name: post.display_name }],
    alternates: { canonical: `/p/${post.slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description,
      publishedTime: post.published_at?.toISOString(),
      authors: [post.display_name],
      images: post.cover_url ? [post.cover_url] : undefined,
    },
    twitter: { card: post.cover_url ? 'summary_large_image' : 'summary', title: post.title, description },
  };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) notFound();

  const related = await getRelatedPosts(post.id, post.author_id, 3);

  return (
    <>
      <ReadingProgress />
      <ViewTracker slug={post.slug} />

      <article className="mx-auto w-full max-w-6xl px-4 pb-24 pt-10 sm:px-6">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeftIcon size={16} />
          Back to stories
        </Link>

        <div className="reader-frame">
          {post.tags?.length ? (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <TagPill key={tag} tag={tag} />
              ))}
            </div>
          ) : null}

          <h1 className="text-balance font-serif text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl">
            {post.title}
          </h1>

          {post.subtitle ? (
            <p className="mt-4 text-pretty text-xl leading-relaxed text-muted">{post.subtitle}</p>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-4 border-y border-line py-4">
            <Link href={`/${post.username}`} className="flex items-center gap-3">
              <Avatar name={post.display_name} username={post.username} src={post.avatar_url} size="md" />
              <span>
                <span className="block text-sm font-semibold text-ink">{post.display_name}</span>
                <span className="block text-[13px] text-muted">@{post.username}</span>
              </span>
            </Link>

            <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
              <time dateTime={post.published_at?.toISOString()}>
                {formatDate(post.published_at ?? post.created_at)}
              </time>
              <span aria-hidden="true">·</span>
              <span>{formatMinutes(post.read_minutes)}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <EyeIcon size={14} /> {formatCount(post.view_count)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ClapIcon size={14} /> {formatCount(post.clap_count)}
              </span>
            </div>
          </div>
        </div>

        {post.cover_url ? (
          <div className="reader-frame mt-8 !max-w-5xl">
            <Image
              src={post.cover_url}
              alt=""
              width={1200}
              height={630}
              priority
              sizes="(max-width: 1024px) 100vw, 1024px"
              className="aspect-[1.9/1] w-full rounded-2xl border border-line object-cover"
            />
          </div>
        ) : null}

        <div
          className="reader-frame markdown mt-10"
          // Rendered from Markdown that was escaped before transformation —
          // see lib/utils/markdown.ts. Author HTML can never reach this string.
          dangerouslySetInnerHTML={{ __html: post.content_html }}
        />

        <div className="reader-frame">
          {/* The one client island in the article: counts are server-rendered
              so nothing shifts, then personalised state is fetched on hydrate. */}
          <PostInteractions slug={post.slug} initialClaps={post.clap_count} initialComments={post.comment_count} />
        </div>

        <div className="reader-frame mt-12 rounded-2xl border border-line bg-surface p-6">
          <div className="flex items-start gap-4">
            <Avatar name={post.display_name} username={post.username} src={post.avatar_url} size="lg" />
            <div className="min-w-0">
              <p className="text-[13px] uppercase tracking-wide text-muted">Written by</p>
              <Link href={`/${post.username}`} className="font-serif text-xl text-ink hover:text-accent">
                {post.display_name}
              </Link>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                @{post.username} · {formatCount(post.view_count)} views on this story
              </p>
            </div>
          </div>
        </div>

        {related.length ? (
          <section className="mt-16">
            <h2 className="mb-2 font-serif text-2xl tracking-tight text-ink">More from {post.display_name}</h2>
            <div>
              {related.map((item) => (
                <PostCard key={item.id} post={item} />
              ))}
            </div>
          </section>
        ) : null}

        <div className="reader-frame">
          <Comments slug={post.slug} />
        </div>
      </article>

      <ReadingToolbar />
    </>
  );
}
