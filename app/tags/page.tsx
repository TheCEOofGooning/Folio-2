import type { Metadata } from 'next';
import Link from 'next/link';
import { TagIcon } from '@/components/icons';
import { EmptyState } from '@/components/ui/card';
import { listPopularTags } from '@/lib/db/queries/posts';
import { formatCount } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Topics', alternates: { canonical: '/tags' } };

/** Topic cloud — pure derived data, so it is prerendered and revalidated. */
export const revalidate = 300;

export default async function TagsPage() {
  const tags = await listPopularTags(60);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6">
      <h1 className="font-serif text-4xl tracking-tight text-ink">Topics</h1>
      <p className="mt-2 text-muted">Every tag writers have used, busiest first.</p>

      {tags.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={<TagIcon size={26} />}
            title="No topics yet"
            description="Tag your first story and it will show up here."
          />
        </div>
      ) : (
        <ul className="mt-10 flex flex-wrap gap-2.5">
          {tags.map((tag) => (
            <li key={tag.slug}>
              <Link
                href={`/tags/${encodeURIComponent(tag.slug)}`}
                className="group inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-card"
              >
                <span className="text-muted transition-colors group-hover:text-accent">#</span>
                {tag.name}
                <span className="text-[12px] text-muted tabular-nums">{formatCount(Number(tag.post_count))}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
