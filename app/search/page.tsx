import type { Metadata } from 'next';
import Link from 'next/link';
import { PostCard } from '@/components/post-card';
import { SearchBox } from '@/components/search-box';
import { SearchIcon } from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/auth/session';
import { searchPosts } from '@/lib/db/queries/posts';
import { searchUsers } from '@/lib/db/queries/users';

export const metadata: Metadata = { title: 'Search' };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const term = (q ?? '').trim();
  const user = await getCurrentUser();

  const [posts, people] = term
    ? await Promise.all([searchPosts(term, user?.id ?? null, 30), searchUsers(term, 5)])
    : [[], []];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-serif text-4xl tracking-tight text-ink">Search</h1>
      <p className="mb-7 mt-2 text-muted">Stories, people and topics — ranked by relevance.</p>

      <SearchBox defaultValue={term} size="lg" autoFocus={!term} />

      {!term ? (
        <p className="mt-10 text-center text-sm text-muted">
          Try “postgres”, “design”, or a writer’s @handle.
        </p>
      ) : (
        <div className="mt-10 space-y-10">
          {people.length ? (
            <section>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted">People</h2>
              <ul className="space-y-2">
                {people.map((person) => (
                  <li key={person.id}>
                    <Link
                      href={`/${person.username}`}
                      className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-accent/40"
                    >
                      <Avatar
                        name={person.display_name}
                        username={person.username}
                        src={person.avatar_url}
                        size="sm"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{person.display_name}</span>
                        <span className="block truncate text-[13px] text-muted">
                          @{person.username}
                          {person.bio ? ` · ${person.bio}` : ''}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted">
              Stories · {posts.length}
            </h2>
            {posts.length === 0 ? (
              <EmptyState
                icon={<SearchIcon size={26} />}
                title={`Nothing matches “${term}”`}
                description="Check the spelling, or search for a broader topic."
              />
            ) : (
              posts.map((post) => <PostCard key={post.id} post={post} />)
            )}
          </section>
        </div>
      )}
    </div>
  );
}
