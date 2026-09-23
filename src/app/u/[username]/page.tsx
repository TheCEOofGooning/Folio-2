import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { PostCard } from "@/components/post/post-card";
import { FollowButton } from "@/components/profile/follow-button";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/misc";
import { ArrowRightIcon, PenIcon } from "@/components/ui/icons";
import { Reveal } from "@/components/motion";
import { getCachedProfile, getCachedActiveAuthors } from "@/db/cached";
import { getPostsByAuthor } from "@/db/queries/posts";
import { formatDate, formatNumber, pluralize } from "@/lib/utils";

/**
 * Public profile.
 *
 * Cached (ISR, 5-minute tag-backed revalidation) and viewer-agnostic: the header,
 * the story list and the counts are identical for everyone. Only the follow
 * button is an island, and only for signed-in readers.
 *
 * Drafts are excluded in SQL, so this page has no way to leak an unpublished
 * story even if a caller made a mistake.
 */
export const revalidate = 300;

interface ProfileProps {
  params: Promise<{ username: string }>;
}

export async function generateStaticParams() {
  try {
    const authors = await getCachedActiveAuthors(20);
    return authors.map((author) => ({ username: author.username }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: ProfileProps): Promise<Metadata> {
  const { username } = await params;
  const profile = await getCachedProfile(username).catch(() => null);
  if (!profile) return { title: "Writer not found" };

  return {
    title: profile.displayName,
    description: profile.tagline || profile.bio || `Stories by ${profile.displayName} on Folio.`,
    alternates: { canonical: `/u/${profile.username}` },
    openGraph: {
      type: "profile",
      title: `${profile.displayName} on Folio`,
      description: profile.tagline || profile.bio,
    },
  };
}

export default async function ProfilePage({ params }: ProfileProps) {
  const { username } = await params;
  const profile = await getCachedProfile(username).catch(() => null);
  if (!profile) notFound();

  const posts = await getPostsByAuthor(profile.username, { limit: 24 });
  const totalClaps = posts.reduce((sum, post) => sum + post.clapCount, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <Reveal>
        <header className="flex flex-wrap items-start gap-6 border-b border-line pb-10">
          <Avatar user={profile} size="xl" />

          <div className="min-w-0 flex-1">
            <Eyebrow className="mb-2">@{profile.username}</Eyebrow>
            <h1 className="font-display text-display text-ink">{profile.displayName}</h1>
            {profile.tagline ? (
              <p className="mt-3 text-lg leading-relaxed text-ink-muted">{profile.tagline}</p>
            ) : null}
            {profile.bio ? (
              <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-muted">{profile.bio}</p>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
              <FollowButton
                username={profile.username}
                displayName={profile.displayName}
                followerCount={profile.followerCount}
              />
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem] text-ink-faint">
                <span>{pluralize(profile.postCount, "story", "stories")}</span>
                <span>{formatNumber(profile.totalClaps)} claps received</span>
                <span>{formatNumber(profile.totalReads)} reads</span>
                <span>Joined {formatDate(profile.createdAt)}</span>
              </div>
            </div>
          </div>

          <Button variant="secondary" asChild className="hidden sm:inline-flex">
            <Link href="/write">
              <PenIcon className="size-4" /> Write
            </Link>
          </Button>
        </header>
      </Reveal>

      <section className="mt-12" aria-labelledby="stories-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="stories-heading" className="font-display text-2xl tracking-[-0.02em] text-ink">
            Stories
          </h2>
          {posts.length > 0 ? (
            <p className="text-[0.8125rem] text-ink-faint">
              {formatNumber(totalClaps)} claps across {pluralize(posts.length, "story", "stories")}
            </p>
          ) : null}
        </div>

        {posts.length === 0 ? (
          <div className="mt-8 rounded-lg border border-dashed border-line py-16 text-center">
            <p className="text-sm text-ink-faint">
              {profile.displayName} hasn&rsquo;t published anything yet.
            </p>
            <Button variant="secondary" asChild className="mt-5">
              <Link href="/explore">
                Read something else <ArrowRightIcon className="size-4" />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="mt-8 grid gap-x-8 gap-y-10 sm:grid-cols-2">
            {posts.map((post, index) => (
              <PostCard key={post.id} post={post} priority={index < 2} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
