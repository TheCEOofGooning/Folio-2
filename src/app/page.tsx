import Link from "next/link";
import type { Metadata } from "next";
import { PostCard } from "@/components/post/post-card";
import { PostList } from "@/components/post/post-list";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/misc";
import { ArrowRightIcon, ClockIcon, PenIcon, SparkleIcon, TrendingIcon } from "@/components/ui/icons";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import {
  getCachedFeatured,
  getCachedFeed,
  getCachedNotableAuthors,
  getCachedTopTags,
} from "@/db/cached";
import { formatNumber, pluralize } from "@/lib/utils";
import type { FeedSort } from "@/db/queries/posts";

/**
 * Home.
 *
 * Rendering strategy: **fully static with ISR**, and that is a deliberate design
 * constraint rather than an accident.
 *
 * The page reads nothing per-request — no cookies, no headers, no `searchParams`.
 * Filtering and sorting live on `/explore`, which is allowed to be dynamic,
 * because a URL like `/?tag=craft` is really a *filtered* view wearing the home
 * page's clothes. Keeping this route parameter-free means:
 *
 *   • it is pre-rendered at build time and revalidated in the background
 *   • a page view is served straight from Vercel's CDN — no function invocation,
 *     no database query, no cold start
 *   • it is the same bytes for every visitor, so it is trivially cacheable
 *
 * Everything below still reads through the tagged data cache, so the revalidation
 * itself is a cache hit rather than a query.
 */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Folio — publish and read, free forever",
  description:
    "A fast, quiet place to publish long-form writing. Read anything for free; publish anything for free. No paywalls, no algorithm, no engagement mechanics.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const [featured, feed, tags, authors] = await Promise.all([
    getCachedFeatured(4),
    getCachedFeed({ sort: "latest" satisfies FeedSort, limit: 12 }),
    getCachedTopTags(12),
    getCachedNotableAuthors(5),
  ]);

  const [hero, ...rest] = featured;
  const totalClaps = feed.reduce((sum, post) => sum + post.clapCount, 0);

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-14 pt-16 sm:px-6 sm:pt-24">
        <div className="max-w-3xl">
          <Reveal>
            <Eyebrow className="mb-5">Free to read · Free to publish</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="font-display text-hero text-ink">
              Writing worth
              <br />
              your attention.
            </h1>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">
              Folio is a publishing platform with no paywall and no algorithm. Stories load in
              milliseconds, writers keep their words, and nothing is optimised for the scroll.
            </p>
          </Reveal>
          <Reveal delay={0.18}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button variant="primary" size="lg" asChild>
                <Link href="/write">
                  <PenIcon className="size-4" /> Start writing
                </Link>
              </Button>
              <Button variant="secondary" size="lg" asChild>
                <Link href="/explore">
                  Explore stories <ArrowRightIcon className="size-4" />
                </Link>
              </Button>
            </div>
          </Reveal>
          <Reveal delay={0.24}>
            <p className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.8125rem] text-ink-faint">
              <span className="inline-flex items-center gap-1.5">
                <SparkleIcon className="size-3.5" />
                PBKDF2-hashed passwords, no third-party auth
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon className="size-3.5" />
                Pages cached at the edge, served in single-digit milliseconds
              </span>
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Featured ─────────────────────────────────────────────────────── */}
      {hero ? (
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6" aria-labelledby="featured-heading">
          <div className="mb-7 flex items-baseline justify-between gap-4">
            <h2 id="featured-heading" className="font-display text-display text-ink">
              Editor&rsquo;s picks
            </h2>
            <Link
              href="/explore"
              className="hidden text-sm text-ink-muted transition-colors hover:text-ink sm:inline-flex sm:items-center sm:gap-1.5"
            >
              Everything <ArrowRightIcon className="size-3.5" />
            </Link>
          </div>

          <Reveal>
            <div className="grid gap-10 lg:grid-cols-[1.55fr_1fr] lg:gap-14">
              <PostCard post={hero} variant="feature" priority />

              <div className="flex flex-col divide-y divide-line lg:pt-1">
                {rest.slice(0, 3).map((post) => (
                  <PostCard key={post.id} post={post} variant="row" className="py-6 first:pt-0 lg:last:pb-0" />
                ))}
                {rest.length === 0 ? (
                  <p className="py-6 text-sm text-ink-faint">
                    More stories appear here as writers publish.
                  </p>
                ) : null}
              </div>
            </div>
          </Reveal>
        </section>
      ) : (
        <EmptyHome />
      )}

      {/* ── Feed ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6" aria-labelledby="feed-heading">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
          <div>
            <h2 id="feed-heading" className="font-display text-2xl tracking-[-0.02em] text-ink">
              Latest stories
            </h2>
            <p className="mt-1 text-[0.8125rem] text-ink-faint">
              {feed.length > 0
                ? `${pluralize(feed.length, "story", "stories")} · ${formatNumber(totalClaps)} claps between them`
                : "Nothing published here yet"}
            </p>
          </div>
          {/* Sorting and filtering live on /explore so this page can stay static.
              These are ordinary links: no client state, no router hooks. */}
          <div className="flex items-center gap-1 text-sm">
            <span className="rounded-md bg-paper-sunken px-3 py-1.5 font-medium text-ink">Latest</span>
            <Link
              href="/explore?sort=trending"
              className="rounded-md px-3 py-1.5 text-ink-faint transition-colors hover:text-ink"
            >
              Trending
            </Link>
            <Link
              href="/explore?sort=discussed"
              className="rounded-md px-3 py-1.5 text-ink-faint transition-colors hover:text-ink"
            >
              Most discussed
            </Link>
          </div>
        </div>

        <div className="mt-9">
          <PostList
            posts={feed}
            priorityCount={3}
            emptyState={
              <p className="rounded-lg border border-dashed border-line py-16 text-center text-sm text-ink-faint">
                No stories match that filter yet.{" "}
                <Link href="/write" className="text-ink underline decoration-line-strong underline-offset-4">
                  Publish the first one
                </Link>
                .
              </p>
            }
          />
        </div>
      </section>

      {/* ── Discovery rail ───────────────────────────────────────────────── */}
      <section className="border-t border-line bg-paper-sunken/40">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="font-display text-2xl tracking-[-0.02em] text-ink">Browse by topic</h2>
            <p className="mt-1.5 text-sm text-ink-muted">
              Every tag is a door. No recommendations, no infinite scroll.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {tags.map((t) => (
                <Link
                  key={t.tag}
                  href={`/explore?tag=${encodeURIComponent(t.tag)}`}
                  className="group inline-flex items-center gap-2 rounded-full border border-line bg-paper-raised px-3.5 py-1.5 text-sm text-ink-muted transition-colors hover:border-ink hover:text-ink"
                >
                  {t.tag}
                  <span className="text-2xs text-ink-faint group-hover:text-ink-muted">{t.postCount}</span>
                </Link>
              ))}
              {tags.length === 0 ? (
                <p className="text-sm text-ink-faint">Tags appear once stories are published.</p>
              ) : null}
            </div>
          </div>

          <div>
            <h2 className="flex items-center gap-2 font-display text-2xl tracking-[-0.02em] text-ink">
              <TrendingIcon className="size-5" /> Writers to follow
            </h2>
            <p className="mt-1.5 text-sm text-ink-muted">Sorted by the applause they&rsquo;ve earned.</p>
            <Stagger className="mt-6 space-y-4">
              {authors.map((author) => (
                <StaggerItem key={author.id}>
                  <Link href={`/u/${author.username}`} className="group flex items-start gap-3">
                    <Avatar user={author} size="md" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink transition-opacity group-hover:opacity-75">
                        {author.displayName}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[0.8125rem] leading-relaxed text-ink-muted">
                        {author.tagline || author.bio || `@${author.username}`}
                      </p>
                      <p className="mt-1 text-xs text-ink-faint">
                        {pluralize(author.postCount, "story", "stories")} · {formatNumber(author.totalClaps)} claps
                      </p>
                    </div>
                  </Link>
                </StaggerItem>
              ))}
              {authors.length === 0 ? (
                <p className="text-sm text-ink-faint">No published writers yet — be the first.</p>
              ) : null}
            </Stagger>
          </div>
        </div>
      </section>
    </>
  );
}

/** Shown on a completely empty install, with the two commands that fix it. */
function EmptyHome() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <div className="rounded-xl border border-dashed border-line bg-paper-raised px-6 py-14 text-center">
        <h2 className="font-display text-2xl tracking-[-0.02em] text-ink">A brand-new Folio</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-muted">
          The database is connected but empty. Seed it with demo writers and essays, or publish
          something of your own.
        </p>
        <pre className="mx-auto mt-5 w-fit rounded-lg border border-line bg-paper-sunken px-4 py-3 text-left text-[0.8125rem] leading-relaxed text-ink-muted">
          <code>{`npm run db:seed      # demo authors + essays
npm run dev          # then visit /write`}</code>
        </pre>
        <Button variant="primary" size="lg" asChild className="mt-6">
          <Link href="/signup">
            <PenIcon className="size-4" /> Create your account
          </Link>
        </Button>
      </div>
    </section>
  );
}
