import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArticleActions } from "@/components/reader/article-actions";
import { ArticleTelemetry } from "@/components/reader/article-telemetry";
import { Comments } from "@/components/reader/comments";
import { ReaderControls } from "@/components/reader/reader-controls";
import { ReadingProgress } from "@/components/reader/reading-progress";
import { Cover } from "@/components/post/cover";
import { PostCard } from "@/components/post/post-card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/misc";
import { ArrowRightIcon, ClockIcon, EyeIcon, TagIcon } from "@/components/ui/icons";
import { Reveal } from "@/components/motion";
import { getCachedPost, getCachedRelated, getCachedSlugs } from "@/db/cached";
import { extractOutline, renderMarkdown } from "@/lib/markdown";
import { formatDate, formatNumber, relativeTime } from "@/lib/utils";

/**
 * The story page.
 *
 * ── Rendering strategy ────────────────────────────────────────────────────────
 *  • `generateStaticParams` pre-renders the most recent 24 stories at build time.
 *  • `revalidate = 60` re-renders them in the background (ISR) — a reader almost
 *    always receives HTML straight from Vercel's CDN with no function invoked.
 *  • The page body never reads cookies or headers, so it stays cacheable. All
 *    personal state (your claps, your bookmark, whether you follow the author)
 *    arrives in the `ArticleActions` island, signed-in readers only.
 *  • Markdown is rendered on the server. No Markdown parser or sanitiser is ever
 *    shipped to the browser, and the escaped HTML is safe to inject by
 *    construction (see `lib/markdown.ts`).
 */
export const revalidate = 60;
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  try {
    const slugs = await getCachedSlugs(24);
    return slugs.map((row) => ({ slug: row.slug }));
  } catch {
    // A cold or unreachable database must not fail the build — pages will be
    // rendered on demand instead.
    return [];
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getCachedPost(slug).catch(() => null);
  if (!post) return { title: "Story not found" };

  const description = post.subtitle || post.excerpt;
  return {
    title: post.title,
    description,
    authors: [{ name: post.author.displayName, url: `/u/${post.author.username}` }],
    keywords: post.tags,
    alternates: { canonical: `/p/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updatedAt,
      authors: [post.author.displayName],
      tags: post.tags,
      images: post.coverImage ? [{ url: post.coverImage }] : undefined,
    },
    twitter: {
      card: post.coverImage ? "summary_large_image" : "summary",
      title: post.title,
      description,
    },
  };
}

export default async function StoryPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getCachedPost(slug).catch(() => null);

  // Drafts are only visible to their author, and `getCachedPost` is deliberately
  // viewer-agnostic — so an unpublished slug is a 404 here. Authors read their own
  // drafts in the editor, which is where editing happens anyway.
  if (!post || post.status === "draft") notFound();

  const [html, outline, related] = await Promise.all([
    Promise.resolve(renderMarkdown(post.content)),
    Promise.resolve(extractOutline(post.content)),
    getCachedRelated(post.id, post.tags, 3).catch(() => []),
  ]);

  return (
    <>
      <ReadingProgress title={post.title} />
      <ArticleTelemetry postId={post.id} />

      <article className="pb-24">
        {/* ── Masthead ─────────────────────────────────────────────────── */}
        <header className="mx-auto max-w-2xl px-4 pt-12 sm:px-6 sm:pt-16">
          <Reveal>
            {post.tags.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {post.tags.map((tag) => (
                  <Link key={tag} href={`/explore?tag=${encodeURIComponent(tag)}`}>
                    <Eyebrow className="transition-colors hover:text-ink-muted">{tag}</Eyebrow>
                  </Link>
                ))}
              </div>
            ) : null}

            <h1 className="mt-4 font-display text-[2.1rem] leading-[1.1] tracking-[-0.03em] text-ink sm:text-[2.75rem]">
              {post.title}
            </h1>

            {post.subtitle ? (
              <p className="mt-5 text-lg leading-relaxed text-ink-muted sm:text-xl">{post.subtitle}</p>
            ) : null}
          </Reveal>

          <Reveal delay={0.08}>
            <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
              <Link href={`/u/${post.author.username}`} className="group flex items-center gap-3">
                <Avatar user={post.author} size="md" />
                <span>
                  <span className="block text-sm font-medium text-ink transition-opacity group-hover:opacity-75">
                    {post.author.displayName}
                  </span>
                  <span className="block text-[0.8125rem] text-ink-faint">
                    {post.author.tagline || `@${post.author.username}`}
                  </span>
                </span>
              </Link>

              <div className="flex items-center gap-3 text-[0.8125rem] text-ink-faint">
                <time dateTime={post.publishedAt ?? post.createdAt}>
                  {formatDate(post.publishedAt ?? post.createdAt)}
                </time>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1.5">
                  <ClockIcon className="size-3.5" /> {post.readingMinutes} min read
                </span>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1.5">
                  <EyeIcon className="size-3.5" /> {formatNumber(post.viewCount)}
                </span>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <ReaderControls />
              </div>
            </div>
          </Reveal>
        </header>

        {/* ── Cover ────────────────────────────────────────────────────── */}
        {post.coverImage ? (
          <Reveal delay={0.12}>
            <div className="mx-auto mt-10 max-w-5xl px-4 sm:px-6">
              <Cover
                image={post.coverImage}
                preset={post.coverPreset}
                title={post.title}
                priority
                className="aspect-[2/1] w-full rounded-xl"
                sizes="(max-width: 1024px) 100vw, 1024px"
              />
            </div>
          </Reveal>
        ) : null}

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <div className="mx-auto mt-10 max-w-2xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-3 border-y border-line py-4">
            <ArticleActions
              postId={post.id}
              slug={post.slug}
              title={post.title}
              authorUsername={post.author.username}
              authorName={post.author.displayName}
              initialClaps={post.clapCount}
              initialComments={post.commentCount}
              initialViews={post.viewCount}
            />
          </div>
        </div>

        {/* ── Body + outline ───────────────────────────────────────────── */}
        <div className="mx-auto mt-12 grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_minmax(0,var(--reader-measure))_1fr]">
          {/* Sticky outline (desktop only) */}
          <aside className="hidden lg:block" aria-label="Contents">
            {outline.length > 2 ? (
              <nav className="sticky top-24 max-w-56">
                <Eyebrow className="mb-3">In this story</Eyebrow>
                <ol className="space-y-2 border-l border-line pl-3">
                  {outline.map((item) => (
                    <li key={item.id} className={item.level === 3 ? "pl-3" : undefined}>
                      <a
                        href={`#${item.id}`}
                        className="block text-[0.8125rem] leading-snug text-ink-faint transition-colors hover:text-ink"
                      >
                        {item.text}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            ) : null}
          </aside>

          {/* The story. HTML is produced by escaping first, then transforming. */}
          <div
            className="article-body min-w-0 lg:col-start-2"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          <div className="hidden lg:block" />
        </div>

        {/* ── Footer of the article ────────────────────────────────────── */}
        <footer className="mx-auto mt-16 max-w-2xl px-4 sm:px-6">
          {post.tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-6">
              <TagIcon className="size-4 text-ink-faint" />
              {post.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/explore?tag=${encodeURIComponent(tag)}`}
                  className="rounded-full border border-line px-3 py-1 text-[0.8125rem] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                >
                  {tag}
                </Link>
              ))}
            </div>
          ) : null}

          {/* Author card */}
          <div className="mt-10 rounded-xl border border-line bg-paper-raised p-6">
            <div className="flex flex-wrap items-start gap-4">
              <Avatar user={post.author} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Written by
                </p>
                <Link
                  href={`/u/${post.author.username}`}
                  className="mt-1 block font-display text-xl tracking-[-0.02em] text-ink transition-opacity hover:opacity-75"
                >
                  {post.author.displayName}
                </Link>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {post.author.bio || post.author.tagline || `@${post.author.username}`}
                </p>
                <p className="mt-3 text-[0.8125rem] text-ink-faint">
                  {formatNumber(post.authorFollowers)} followers ·{" "}
                  {formatNumber(post.authorPosts)} stories
                </p>
              </div>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-ink-faint">
            Published {relativeTime(post.publishedAt ?? post.createdAt)}
            {post.updatedAt !== post.publishedAt ? ` · edited ${relativeTime(post.updatedAt)}` : ""}
          </p>
        </footer>

        {/* ── Related ──────────────────────────────────────────────────── */}
        {related.length > 0 ? (
          <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6" aria-labelledby="related-heading">
            <h2
              id="related-heading"
              className="mb-7 flex items-center gap-2 font-display text-2xl tracking-[-0.02em] text-ink"
            >
              More on {post.tags[0] ?? "Folio"}
              <ArrowRightIcon className="size-4 text-ink-faint" />
            </h2>
            <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <PostCard key={item.id} post={item} />
              ))}
            </div>
          </section>
        ) : null}
      </article>

      {/* ── Responses ────────────────────────────────────────────────────── */}
      <div className="border-t border-line bg-paper-sunken/40 py-16">
        <Comments postId={post.id} initialCount={post.commentCount} authorUsername={post.author.username} />
      </div>
    </>
  );
}
