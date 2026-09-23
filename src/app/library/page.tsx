import Link from "next/link";
import type { Metadata } from "next";
import { PostCard } from "@/components/post/post-card";
import { BookmarkIcon, BookOpenIcon, ClockIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSession } from "@/lib/auth/session";
import { getBookmarkedPosts, getReadingHistory } from "@/db/queries/social";
import { formatNumber, pluralize, relativeTime } from "@/lib/utils";

/**
 * Library — saved stories and reading history.
 *
 * Dynamic and private. History shows *where you stopped*, not just what you
 * opened, because a list of unfinished stories is far more useful than a list of
 * visited URLs.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Library",
  description: "Stories you saved and everything you've been reading.",
  robots: { index: false, follow: false },
};

export default async function LibraryPage() {
  const user = await getSession();

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <BookmarkIcon className="mx-auto size-8 text-ink-faint" />
        <h1 className="mt-5 font-display text-display text-ink">Your library</h1>
        <p className="mx-auto mt-4 max-w-md text-[0.9375rem] leading-relaxed text-ink-muted">
          Saved stories and reading history live here. Sign in to see yours — Folio keeps them tied
          to your account, not to a cookie in this browser.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button variant="primary" size="lg" asChild>
            <Link href="/login?next=/library">Sign in</Link>
          </Button>
          <Button variant="secondary" size="lg" asChild>
            <Link href="/signup">Create an account</Link>
          </Button>
        </div>
      </div>
    );
  }

  const [bookmarks, history] = await Promise.all([
    getBookmarkedPosts(user.id, 30),
    getReadingHistory(user.id, 30),
  ]);

  const unfinished = history.filter((entry) => entry.progress < 0.9);

  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <header className="border-b border-line pb-8">
        <Eyebrow className="mb-3">Library</Eyebrow>
        <h1 className="font-display text-display text-ink">Saved for later</h1>
        <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-ink-muted">
          {pluralize(bookmarks.length, "saved story", "saved stories")}
          {unfinished.length > 0
            ? ` · ${pluralize(unfinished.length, "story", "stories")} you haven't finished`
            : ""}
          .
        </p>
      </header>

      <Tabs defaultValue="saved" className="mt-8">
        <TabsList>
          <TabsTrigger value="saved">
            <BookmarkIcon className="size-4" /> Saved
            <span className="text-ink-faint">{bookmarks.length}</span>
          </TabsTrigger>
          <TabsTrigger value="history">
            <ClockIcon className="size-4" /> History
            <span className="text-ink-faint">{history.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="saved" className="pt-8">
          {bookmarks.length === 0 ? (
            <Empty
              icon={<BookmarkIcon className="size-6" />}
              title="Nothing saved yet"
              body="Tap “Save” on any story and it lands here — available offline in your memory, on any device you sign in from."
            />
          ) : (
            <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2">
              {bookmarks.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="pt-8">
          {history.length === 0 ? (
            <Empty
              icon={<BookOpenIcon className="size-6" />}
              title="No reading history"
              body="Open a story and Folio remembers how far you got, so you can pick it up mid-paragraph."
            />
          ) : (
            <ul className="divide-y divide-line">
              {history.map((entry) => {
                const percent = Math.round(entry.progress * 100);
                return (
                  <li key={entry.id}>
                    <Link href={`/p/${entry.slug}`} className="group flex items-start gap-4 py-5">
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-lg leading-snug tracking-[-0.02em] text-ink transition-opacity group-hover:opacity-75">
                          {entry.title}
                        </p>
                        <p className="mt-1 text-[0.8125rem] text-ink-faint">
                          {entry.author.displayName} · last read {relativeTime(entry.lastReadAt)} ·{" "}
                          {entry.readingMinutes} min
                        </p>
                        <div className="mt-3 flex items-center gap-3">
                          <div className="h-1 w-32 overflow-hidden rounded-full bg-paper-sunken" aria-hidden>
                            <div
                              className={percent >= 90 ? "h-full bg-success" : "h-full bg-accent"}
                              style={{ width: `${Math.max(4, Math.min(100, percent))}%` }}
                            />
                          </div>
                          <span className="text-xs text-ink-faint">
                            {percent >= 95 ? "Finished" : `${percent}% read`}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <p className="mt-14 text-center text-xs text-ink-faint">
        {formatNumber(history.reduce((sum, entry) => sum + entry.wordCount, 0))} words in your
        history. Folio never shares this.
      </p>
    </div>
  );
}

function Empty({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-16 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full border border-line text-ink-faint">
        {icon}
      </span>
      <p className="mt-4 font-medium text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">{body}</p>
      <Button variant="secondary" className="mt-6" asChild>
        <Link href="/explore">Browse stories</Link>
      </Button>
    </div>
  );
}
