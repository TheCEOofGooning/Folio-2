import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PostCard } from '@/components/post-card';
import { ArrowLeftIcon } from '@/components/icons';
import { listPopularTags, listPostsByTag } from '@/lib/db/queries/posts';

export const revalidate = 120;

export async function generateStaticParams() {
  const tags = await listPopularTags(40);
  return tags.map((tag) => ({ tag: tag.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  // generateMetadata runs before the page, so this is where an unknown tag has
  // to be marked noindex — the 404 UI alone would leave it indexable.
  const exists = (await listPostsByTag(decoded, null, 1)).length > 0;
  if (!exists) return { title: `#${decoded}`, robots: { index: false, follow: false } };
  return { title: `#${decoded}`, alternates: { canonical: `/tags/${decoded}` } };
}

export default async function TagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const slug = decodeURIComponent(tag);
  const posts = await listPostsByTag(slug, null, 40);

  // An unknown tag is a missing resource, not an empty one. Without this the
  // URL would render an empty archive and read as a soft 404 to crawlers.
  if (posts.length === 0) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <Link href="/tags" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeftIcon size={16} /> All topics
      </Link>

      <h1 className="font-serif text-4xl tracking-tight text-ink">#{slug}</h1>
      <p className="mt-2 text-muted">
        {posts.length} {posts.length === 1 ? 'story' : 'stories'} tagged with {slug}.
      </p>

      <div className="mt-8">
        {posts.map((post) => <PostCard key={post.id} post={post} />)}
      </div>
    </div>
  );
}
