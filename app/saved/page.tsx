import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PostCard } from '@/components/post-card';
import { BookmarkIcon, ClapIcon } from '@/components/icons';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/auth/session';
import { listClappedPosts } from '@/lib/db/queries/engage';
import { getSavedPosts } from '@/lib/db/queries/users';

export const metadata: Metadata = { title: 'Saved', robots: { index: false } };

export default async function SavedPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/saved');

  const [saved, clapped] = await Promise.all([getSavedPosts(user.id, 50), listClappedPosts(user.id, 12)]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-serif text-4xl tracking-tight text-ink">Your library</h1>
      <p className="mt-2 text-muted">Stories you saved, and the ones you clapped for.</p>

      <section className="mt-10">
        <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
          <BookmarkIcon size={14} /> Saved · {saved.length}
        </h2>
        {saved.length === 0 ? (
          <EmptyState
            icon={<BookmarkIcon size={26} />}
            title="Nothing saved yet"
            description="Tap Save on any story to keep it here for later."
            action={<ButtonLink href="/">Browse stories</ButtonLink>}
          />
        ) : (
          saved.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </section>

      {clapped.length ? (
        <section className="mt-12">
          <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
            <ClapIcon size={14} /> Clapped
          </h2>
          {clapped.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
