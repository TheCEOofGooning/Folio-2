import Link from "next/link";
import { getCachedActiveAuthors, getCachedTopTags } from "@/db/cached";

/**
 * Footer — a server component that reads straight from the database.
 *
 * Because the tag rail is tiny and almost never changes, it is fetched through
 * `unstable_cache` with a tag, so publishing a post refreshes the footer
 * everywhere at once instead of after the ISR window expires.
 */
export async function Footer() {
  // Cached and tagged: publishing a post refreshes the footer everywhere at once,
  // and a database that is briefly unreachable degrades to an empty rail instead
  // of failing the page (which also keeps `next build` working without a database).
  const [tags, authors] = await Promise.all([
    getCachedTopTags(10).catch(() => []),
    getCachedActiveAuthors(5).catch(() => []),
  ]);

  return (
    <footer className="mt-24 border-t border-line bg-paper-sunken/50">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <p className="font-display text-2xl tracking-[-0.03em] text-ink">Folio</p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-muted">
              A quiet place to publish. No paywalls, no engagement mechanics, no algorithm —
              just writing, and the people who want to read it.
            </p>
            <p className="mt-4 text-xs text-ink-faint">
              Built with Next.js, Neon and about four hundred lines of backend code.
            </p>
          </div>

          <div>
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-faint">Topics</p>
            <ul className="mt-3 space-y-2">
              {tags.slice(0, 6).map((tag) => (
                <li key={tag.tag}>
                  <Link
                    href={`/explore?tag=${encodeURIComponent(tag.tag)}`}
                    className="text-sm text-ink-muted transition-colors hover:text-ink"
                  >
                    {tag.tag}{" "}
                    <span className="text-xs text-ink-faint">({tag.postCount})</span>
                  </Link>
                </li>
              ))}
              {tags.length === 0 ? (
                <li className="text-sm text-ink-faint">Publish the first story to seed topics.</li>
              ) : null}
            </ul>
          </div>

          <div>
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-faint">Writers</p>
            <ul className="mt-3 space-y-2">
              {authors.map((author) => (
                <li key={author.username}>
                  <Link
                    href={`/u/${author.username}`}
                    className="text-sm text-ink-muted transition-colors hover:text-ink"
                  >
                    {author.displayName}
                  </Link>
                </li>
              ))}
              {authors.length === 0 ? (
                <li className="text-sm text-ink-faint">No published writers yet.</li>
              ) : null}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Folio. Writing belongs to the people who wrote it.</p>
          <nav className="flex gap-5">
            <Link href="/about" className="transition-colors hover:text-ink">
              About
            </Link>
            <Link href="/explore" className="transition-colors hover:text-ink">
              Explore
            </Link>
            <Link href="/signup" className="transition-colors hover:text-ink">
              Start writing
            </Link>
            <a href="/sitemap.xml" className="transition-colors hover:text-ink">
              Sitemap
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
