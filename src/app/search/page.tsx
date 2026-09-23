import Link from "next/link";
import type { Metadata } from "next";
import { PostList } from "@/components/post/post-list";
import { TagFilter } from "@/components/feed/feed-controls";
import { Eyebrow } from "@/components/ui/misc";
import { SearchIcon } from "@/components/ui/icons";
import { getCachedTopTags } from "@/db/cached";
import { searchPosts, type FeedSort } from "@/db/queries/posts";
import { pluralize } from "@/lib/utils";

/**
 * Search.
 *
 * Deliberately dynamic and uncached: a search term is the one query where a stale
 * answer is worse than a slow one. The database does the filtering (indexed ILIKE
 * plus a relevance CASE), so the server sends only the rows that will be rendered
 * — no search index to keep in sync, no client-side filtering of a payload that
 * should never have been fetched.
 */
export const dynamic = "force-dynamic";

interface SearchProps {
  searchParams: Promise<{ q?: string; tag?: string; sort?: string }>;
}

export async function generateMetadata({ searchParams }: SearchProps): Promise<Metadata> {
  const { q } = await searchParams;
  return {
    title: q ? `Search: ${q}` : "Search",
    description: "Search every story, writer and topic on Folio.",
    // Search results are for the person searching, not for a crawler's index.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: SearchProps) {
  const params = await searchParams;
  const term = params.q?.trim() ?? "";
  const tag = params.tag?.trim().toLowerCase() || null;
  const sort = (["latest", "trending", "discussed"].includes(params.sort ?? "")
    ? params.sort
    : "latest") as FeedSort;

  const [results, tags] = await Promise.all([
    term || tag ? searchPosts({ query: term || null, tag, sort, limit: 30 }) : Promise.resolve([]),
    getCachedTopTags(12),
  ]);

  const searched = Boolean(term || tag);

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <header className="max-w-2xl">
        <Eyebrow className="mb-4">Search</Eyebrow>
        <h1 className="font-display text-display text-ink">
          {term ? `Results for “${term}”` : "Find something worth reading"}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-muted">
          {searched
            ? results.length > 0
              ? `${pluralize(results.length, "story", "stories")} matched. Ranked by title first, then tags and author.`
              : "Nothing matched. Try a broader term, or browse a topic below."
            : "Search across titles, subtitles, bodies, writers and tags. Press ⌘K anywhere on Folio."}
        </p>
      </header>

      {/* Search field — a plain GET form, so it works with JavaScript disabled. */}
      <form action="/search" className="mt-8 flex max-w-xl items-center gap-2">
        <label className="relative flex-1">
          <span className="visually-hidden">Search Folio</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4.5 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            name="q"
            defaultValue={term}
            autoFocus
            placeholder="postgres, typography, Ada Merrill…"
            className="h-11 w-full rounded-md border border-line bg-paper-raised pl-10 pr-3 text-[0.9375rem] outline-none transition-colors hover:border-line-strong focus:border-accent focus:ring-4 focus:ring-accent/12"
          />
        </label>
        <button
          type="submit"
          className="h-11 shrink-0 rounded-md bg-ink px-5 text-sm font-medium text-paper transition-opacity hover:opacity-90"
        >
          Search
        </button>
      </form>

      <section className="mt-10" aria-labelledby="topics-heading">
        <h2 id="topics-heading" className="visually-hidden">
          Filter by topic
        </h2>
        <TagFilter tags={tags} activeTag={tag} />
      </section>

      {searched ? (
        <section className="mt-12">
          <PostList
            posts={results}
            variant="row"
            emptyState={
              <div className="rounded-lg border border-dashed border-line py-16 text-center">
                <p className="text-sm text-ink-faint">
                  No matches for “{term}”.{" "}
                  <Link href="/explore" className="text-ink underline decoration-line-strong underline-offset-4">
                    Browse everything
                  </Link>{" "}
                  instead.
                </p>
              </div>
            }
          />
        </section>
      ) : (
        <section className="mt-12">
          <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Suggested
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {["postgres", "typography", "craft", "habits", "performance", "writing"].map((suggestion) => (
              <Link
                key={suggestion}
                href={`/search?q=${encodeURIComponent(suggestion)}`}
                className="rounded-full border border-line px-3.5 py-1.5 text-sm text-ink-muted transition-colors hover:border-ink hover:text-ink"
              >
                {suggestion}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
