import Link from "next/link";
import type { Metadata } from "next";
import { PostCard } from "@/components/post/post-card";
import { PostList } from "@/components/post/post-list";
import { SortTabs, TagFilter } from "@/components/feed/feed-controls";
import { Avatar } from "@/components/ui/avatar";
import { Eyebrow } from "@/components/ui/misc";
import { ArrowRightIcon, TrendingIcon } from "@/components/ui/icons";
import { Reveal } from "@/components/motion";
import {
  getCachedActiveAuthors,
  getCachedFeed,
  getCachedFeatured,
  getCachedTopTags,
} from "@/db/cached";
import { formatNumber, hueFromString, pluralize } from "@/lib/utils";
import type { FeedSort } from "@/db/queries/posts";

/**
 * Explore — the discovery surface.
 *
 * Doubles as the filtered feed: `?tag=` and `?sort=` are the same parameters the
 * home page uses, so every filter is a linkable, shareable, crawlable URL. Reads
 * go through the tagged data cache, so a filter change usually resolves without a
 * database round trip.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Explore",
  description:
    "Browse every story on Folio by topic — no algorithm, no recommended-for-you, just writing organised by subject.",
  alternates: { canonical: "/explore" },
};

interface ExploreProps {
  searchParams: Promise<{ tag?: string; sort?: string }>;
}

export default async function ExplorePage({ searchParams }: ExploreProps) {
  const params = await searchParams;
  const tag = params.tag?.trim().toLowerCase() || null;
  const sort = (["latest", "trending", "discussed"].includes(params.sort ?? "")
    ? params.sort
    : "trending") as FeedSort;

  const [tags, posts, authors, featured] = await Promise.all([
    getCachedTopTags(20),
    getCachedFeed({ sort, tag, limit: 24 }),
    getCachedActiveAuthors(8),
    getCachedFeatured(1),
  ]);

  const [spotlight] = featured;
  const totalClaps = posts.reduce((sum, post) => sum + post.clapCount, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <header className="max-w-2xl">
        <Eyebrow className="mb-4">Explore</Eyebrow>
        <h1 className="font-display text-display text-ink">Everything published on Folio</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-muted">
          {tag ? (
            <>
              {pluralize(posts.length, "story", "stories")} tagged{" "}
              <span className="font-medium text-ink">{tag}</span>, {formatNumber(totalClaps)} claps
              between them.
            </>
          ) : (
            <>
              {pluralize(posts.length, "story", "stories")} across {pluralize(tags.length, "topic")}.
              Filter by subject, or just read down the page.
            </>
          )}
        </p>
      </header>

      {/* Topic rail */}
      <section aria-labelledby="topics-heading" className="mt-10">
        <h2 id="topics-heading" className="visually-hidden">
          Filter by topic
        </h2>
        <TagFilter tags={tags} activeTag={tag} />
      </section>

      {/* Spotlight — one story, given room to breathe */}
      {spotlight && !tag ? (
        <Reveal className="mt-14">
          <div className="grid gap-8 rounded-2xl border border-line bg-paper-raised p-6 sm:p-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
            <PostCard post={spotlight} variant="feature" priority />
            <div className="lg:pl-2">
              <h2 className="flex items-center gap-2 font-display text-2xl tracking-[-0.02em] text-ink">
                <TrendingIcon className="size-5" /> Most clapped right now
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                Ranked by claps, comments and reads with a time decay, so an old story cannot sit
                at the top forever on accumulated applause. No personalisation — every reader sees
                the same list.
              </p>
              <div className="mt-6">
                <h3 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Writers publishing here
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {authors.map((author) => (
                    <Link
                      key={author.username}
                      href={`/u/${author.username}`}
                      className="inline-flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-[0.8125rem] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                    >
                      <Avatar
                        user={{
                          displayName: author.displayName,
                          avatarUrl: null,
                          avatarHue: hueFromString(author.username),
                        }}
                        size="xs"
                      />
                      {author.displayName}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      ) : null}

      {/* The list */}
      <section className="mt-14" aria-labelledby="results-heading">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
          <h2 id="results-heading" className="font-display text-2xl tracking-[-0.02em] text-ink">
            {tag ? `Tagged ${tag}` : "All stories"}
          </h2>
          <SortTabs label="Sort results" />
        </div>

        <div className="mt-9">
          <PostList
            posts={posts}
            className="lg:grid-cols-2 xl:grid-cols-3"
            emptyState={
              <div className="rounded-lg border border-dashed border-line py-16 text-center">
                <p className="text-sm text-ink-faint">
                  Nothing published under that filter yet.
                </p>
                <Link
                  href="/explore"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm text-ink underline decoration-line-strong underline-offset-4"
                >
                  See everything <ArrowRightIcon className="size-3.5" />
                </Link>
              </div>
            }
          />
        </div>
      </section>
    </div>
  );
}
