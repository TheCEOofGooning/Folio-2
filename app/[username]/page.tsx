import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PostCard } from '@/components/post-card';
import { ArrowRightIcon, ClapIcon, ClockIcon, EyeIcon } from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/card';
import { getProfileByUsername, listUsers } from '@/lib/db/queries/users';
import { listPostsByAuthor } from '@/lib/db/queries/posts';
import { formatCount, formatDate } from '@/lib/utils/format';

/** Profiles are public, cacheable pages — regenerated every two minutes. */
export const revalidate = 120;

export async function generateStaticParams() {
  const users = await listUsers(40);
  return users.map((user) => ({ username: user.username }));
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  if (!profile) return { title: 'Writer not found', robots: { index: false, follow: false } };
  return {
    title: `${profile.display_name} (@${profile.username})`,
    description: profile.bio ?? `Stories by ${profile.display_name} on Folio.`,
    alternates: { canonical: `/${profile.username}` },
    openGraph: {
      type: 'profile',
      title: profile.display_name,
      description: profile.bio ?? undefined,
      images: profile.avatar_url ? [profile.avatar_url] : undefined,
    },
  };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  if (!profile) notFound();

  const posts = await listPostsByAuthor(profile.id, null, 50);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <Avatar name={profile.display_name} username={profile.username} src={profile.avatar_url} size="xl" />
        <div className="min-w-0">
          <h1 className="font-serif text-3xl tracking-tight text-ink sm:text-4xl">{profile.display_name}</h1>
          <p className="mt-1 text-muted">@{profile.username}</p>
          {profile.bio ? <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink/85">{profile.bio}</p> : null}
          {profile.location ? <p className="mt-2 text-sm text-muted">{profile.location}</p> : null}
          <p className="mt-3 text-[13px] text-muted">Writing since {formatDate(profile.created_at)}</p>
        </div>
      </header>

      <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Stories', value: formatCount(Number(profile.published_count)), icon: <ArrowRightIcon size={14} /> },
          { label: 'Views', value: formatCount(Number(profile.total_views ?? 0)), icon: <EyeIcon size={14} /> },
          { label: 'Claps', value: formatCount(Number(profile.total_claps ?? 0)), icon: <ClapIcon size={14} /> },
          {
            label: 'Read time',
            value: `${formatCount(Number(profile.total_read_minutes ?? 0))}m`,
            icon: <ClockIcon size={14} />,
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-line bg-surface px-4 py-3">
            <dt className="flex items-center gap-1.5 text-[13px] text-muted">
              {stat.icon}
              {stat.label}
            </dt>
            <dd className="mt-1 font-serif text-2xl text-ink tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-12">
        <h2 className="mb-2 font-serif text-2xl tracking-tight text-ink">Stories</h2>
        {posts.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No published stories yet"
              description={`${profile.display_name} has not published anything yet.`}
              action={<ButtonLink href="/write">Write something</ButtonLink>}
            />
          </div>
        ) : (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </section>

      <p className="mt-10 text-sm text-muted">
        Reading something you like?{' '}
        <Link href="/register" className="text-accent hover:underline">
          Create a free account
        </Link>{' '}
        to clap, save and reply.
      </p>
    </div>
  );
}
