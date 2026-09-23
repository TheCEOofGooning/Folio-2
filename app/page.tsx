import type { Metadata } from 'next';
import Link from 'next/link';

import { FeedSort } from '@/components/feed-sort';
import { PostCard } from '@/components/post-card';
import { Stagger, StaggerItem } from '@/components/reveal';
import { SparkIcon, TrendingIcon } from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/auth/session';
import { listPopularTags, listPosts } from '@/lib/db/queries/posts';
import { TagPill } from '@/components/ui/badge';

export const metadata: Metadata = {
  title: 'Folio — publish and read, free',
  alternates: { canonical: '/' },
};

const SORTS = new Set(['latest', 'trending', 'discussed']);

export default async function HomePage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { sort } = await searchParams;
  const activeSort = SORTS.has(sort ?? '') ? (sort as 'latest' | 'trending' | 'discussed') : 'latest';

  // Reading the session makes this route dynamic — the feed is personalised
  // (clapped / bookmarked flags), so a shared cache would leak reader state.
  const user = await getCurrentUser();
  const [posts, tags] = await Promise.all([
    listPosts({ status: 'published', sort: activeSort, userId: user?.id ?? null, limit: 20 }),
    listPopularTags(12),
  ]);

  const [featured, ...rest] = posts;

  return (
    <>
      <section className="ambient relative overflow-hidden border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-muted">
            <SparkIcon size={14} className="text-accent" />
            Free to read. Free to publish.
          </p>
          <h1 className="max-w-3xl text-balance font-serif text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-6xl">
            A quiet, fast home for your writing.
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted">
            Write in Markdown, publish in one click, and be read in a distraction-free viewer. No paywall, no
            trackers, no editor breathing down your neck.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href={user ? '/write' : '/register'} size="lg">
              {user ? 'Write a story' : 'Start writing'}
            </ButtonLink>
            <ButtonLink href="/?sort=trending" variant="outline" size="lg">
              <TrendingIcon size={17} />
              See what’s trending
            </ButtonLink>
          </div>
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <div className="mb-2 flex items-center justify-between gap-4">
            <h2 className="font-serif text-2xl tracking-tight text-ink">Stories</h2>
            <FeedSort current={activeSort} />
          </div>

          {posts.length === 0 ? (
            <EmptyState
              icon={<SparkIcon size={28} />}
              title="Nothing published yet"
              description="Folio is quiet right now. Be the first to publish something worth reading."
              action={
                <ButtonLink href={user ? '/write' : '/register'}>
                  {user ? 'Write the first story' : 'Create your account'}
                </ButtonLink>
              }
            />
          ) : (
            <Stagger>
              {featured && activeSort === 'latest' ? (
                <StaggerItem>
                  <PostCard post={featured} featured />
                </StaggerItem>
              ) : null}
              {(featured && activeSort === 'latest' ? rest : posts).map((post) => (
                <StaggerItem key={post.id}>
                  <PostCard post={post} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink">Popular topics</h3>
            {tags.length === 0 ? (
              <p className="text-sm text-muted">Topics appear once stories are tagged.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <TagPill key={tag.slug} tag={tag.slug} />
                ))}
              </div>
            )}
            <Link
              href="/tags"
              className="mt-4 inline-block text-sm text-accent transition-opacity hover:opacity-80"
            >
              Browse all topics →
            </Link>
          </div>

          {user ? (
            <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-center gap-3">
                <Avatar name={user.display_name} username={user.username} src={user.avatar_url} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{user.display_name}</p>
                  <p className="truncate text-xs text-muted">@{user.username}</p>
                </div>
              </div>
              <ButtonLink href="/write" variant="secondary" size="sm" className="mt-4 w-full justify-center">
                Continue writing
              </ButtonLink>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
              <h3 className="font-serif text-lg text-ink">Become a writer</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                An account takes ten seconds and gives you a dashboard, analytics and a permanent home for your work.
              </p>
              <ButtonLink href="/register" variant="secondary" size="sm" className="mt-4 w-full justify-center">
                Create free account
              </ButtonLink>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
