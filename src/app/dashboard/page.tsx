import Link from "next/link";
import type { Metadata } from "next";
import { TrafficChart } from "@/components/dashboard/traffic-chart";
import { PostRow } from "@/components/dashboard/post-row";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Eyebrow, StatSentence } from "@/components/ui/misc";
import { PenIcon, PlusIcon } from "@/components/ui/icons";
import { Reveal } from "@/components/motion";
import { requireUser } from "@/lib/auth/session";
import {
  getAuthorAnalytics,
  getAuthorReferrers,
  getAuthorTraffic,
  getDashboardStats,
} from "@/db/queries/users";
import { formatDuration, formatNumber, pluralize, relativeTime } from "@/lib/utils";

/**
 * Creator dashboard.
 *
 * Fully dynamic and private: it reads the session, so it can never be cached or
 * shared. That is the correct trade — the account-agnostic surfaces are the ones
 * worth caching, and this is not one of them.
 *
 * All aggregation happens in Postgres. `post_views` is the fact table and it grows
 * with traffic, so shipping rows to the function to reduce them in JavaScript
 * would make the dashboard slower exactly as the publication got more popular.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const user = await requireUser();

  const [stats, analytics, traffic, referrers] = await Promise.all([
    getDashboardStats(user.id),
    getAuthorAnalytics(user.id),
    getAuthorTraffic(user.id, 30),
    getAuthorReferrers(user.id, 5),
  ]);

  const published = analytics.filter((row) => row.status === "published");
  const drafts = analytics.filter((row) => row.status !== "published");
  const readingNow = analytics.reduce((sum, row) => sum + row.readingNow, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <Reveal>
        <header className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
          <div>
            <Eyebrow className="mb-3">Creator dashboard</Eyebrow>
            <h1 className="font-display text-display text-ink">
              {greeting()}, {user.displayName.split(" ")[0]}
            </h1>
            <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-ink-muted">
              {stats.publishedCount === 0
                ? "Nothing published yet. Your first story takes about an hour to write and a second to publish."
                : `${pluralize(stats.publishedCount, "story", "stories")} published, ${pluralize(stats.draftCount, "draft")} in progress${
                    readingNow > 0 ? `, ${pluralize(readingNow, "person", "people")} reading right now` : ""
                  }.`}
            </p>
            {readingNow > 0 ? (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/8 px-3 py-1 text-[0.8125rem] text-success">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-70" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                </span>
                {pluralize(readingNow, "reader")} on your stories in the last two minutes
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" asChild>
              <Link href={`/u/${user.username}`}>View profile</Link>
            </Button>
            <Button variant="primary" asChild>
              <Link href="/write">
                <PenIcon className="size-4" /> New story
              </Link>
            </Button>
          </div>
        </header>
      </Reveal>

      {/* Headline numbers — as sentences, not gauges */}
      <section className="mt-10 grid gap-8 border-b border-line pb-10 sm:grid-cols-2 lg:grid-cols-4">
        <StatSentence label="Total reads" value={formatNumber(stats.totalViews)} />
        <StatSentence label="Applause" value={formatNumber(stats.totalClaps)} />
        <StatSentence label="Responses" value={formatNumber(stats.totalComments)} />
        <StatSentence
          label="Avg. time reading"
          value={stats.avgReadSeconds > 0 ? formatDuration(stats.avgReadSeconds) : "—"}
        />
      </section>

      {/* Trend + referrers */}
      <section className="mt-12 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-xl border border-line bg-paper-raised p-6">
          <h2 className="mb-5 font-display text-xl tracking-[-0.02em] text-ink">Attention over time</h2>
          <TrafficChart points={traffic} />
        </div>

        <div className="rounded-xl border border-line bg-paper-raised p-6">
          <h2 className="mb-1 font-display text-xl tracking-[-0.02em] text-ink">Where readers come from</h2>
          <p className="mb-5 text-[0.8125rem] text-ink-muted">Referrers, as recorded by the reader heartbeat.</p>
          {referrers.length === 0 ? (
            <p className="text-sm text-ink-faint">No traffic recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {referrers.map((referrer) => {
                const share = Math.round((referrer.readers / Math.max(1, referrers[0].readers)) * 100);
                const label = prettifyReferrer(referrer.referrer);
                return (
                  <li key={referrer.referrer}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate text-ink-muted">{label}</span>
                      <span className="tabular-nums text-ink-faint">{referrer.readers}</span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-paper-sunken">
                      <div className="h-full rounded-full bg-ink/25" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Post table */}
      <section className="mt-14" aria-labelledby="stories-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="stories-heading" className="font-display text-2xl tracking-[-0.02em] text-ink">
            Your stories
          </h2>
          <p className="text-[0.8125rem] text-ink-faint">
            {published.length} live · {drafts.length} draft
          </p>
        </div>

        {analytics.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-line py-16 text-center">
            <p className="text-sm text-ink-muted">You haven&rsquo;t written anything yet.</p>
            <Button variant="primary" asChild className="mt-5">
              <Link href="/write">
                <PlusIcon className="size-4" /> Start your first story
              </Link>
            </Button>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-left">
              <caption className="visually-hidden">
                Every story you own, with reads, applause, average reading time and completion rate.
              </caption>
              <thead>
                <tr className="border-b border-line-strong text-2xs uppercase tracking-[0.12em] text-ink-faint">
                  <th scope="col" className="py-3 pr-4 font-semibold">
                    Story
                  </th>
                  <th scope="col" className="hidden py-3 pr-4 font-semibold sm:table-cell">
                    Reads
                  </th>
                  <th scope="col" className="hidden py-3 pr-4 font-semibold sm:table-cell">
                    Claps
                  </th>
                  <th scope="col" className="hidden py-3 pr-4 font-semibold md:table-cell">
                    Avg. time
                  </th>
                  <th scope="col" className="hidden py-3 pr-4 font-semibold md:table-cell">
                    Finished
                  </th>
                  <th scope="col" className="py-3 text-right font-semibold">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {analytics.map((row) => (
                  <PostRow key={row.postId} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Writers the account follows */}
      <section className="mt-14 grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-paper-raised p-6">
          <h2 className="font-display text-xl tracking-[-0.02em] text-ink">Your followers</h2>
          <p className="mt-2 text-[0.8125rem] text-ink-muted">
            {stats.followers === 0
              ? "Nobody is following you yet. Publishing consistently is the whole trick."
              : `${pluralize(stats.followers, "person", "people")} follow your work.`}
          </p>
          <p className="mt-5 font-display text-4xl tracking-[-0.02em] text-ink">
            {formatNumber(stats.followers)}
          </p>
        </div>

        <div className="rounded-xl border border-line bg-paper-raised p-6">
          <h2 className="font-display text-xl tracking-[-0.02em] text-ink">Total attention</h2>
          <p className="mt-2 text-[0.8125rem] text-ink-muted">
            Reader-seconds accumulated across everything you have published — the only metric here
            that cannot be gamed by refreshing a page.
          </p>
          <p className="mt-5 font-display text-4xl tracking-[-0.02em] text-ink">
            {stats.totalReads > 3600
              ? `${Math.round(stats.totalReads / 3600)}h`
              : formatDuration(stats.totalReads)}
          </p>
        </div>
      </section>

      {drafts.length > 0 ? (
        <section className="mt-14">
          <h2 className="font-display text-2xl tracking-[-0.02em] text-ink">Continue writing</h2>
          <ul className="mt-5 divide-y divide-line">
            {drafts.map((draft) => (
              <li key={draft.postId}>
                <Link
                  href={`/write/${draft.slug}`}
                  className="flex items-center justify-between gap-4 py-4 transition-colors hover:bg-paper-sunken/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{draft.title}</span>
                    <span className="mt-0.5 block text-xs text-ink-faint">
                      Edited {relativeTime(draft.publishedAt ?? new Date().toISOString())}
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-ink-muted">
                    <PenIcon className="size-3.5" /> Continue
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-16 rounded-xl border border-line bg-paper-sunken/50 p-6">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar user={user} size="md" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">Make your profile work for you</p>
            <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-muted">
              A tagline, a short bio and an avatar are the difference between a reader following
              you and closing the tab.
            </p>
          </div>
          <Button variant="secondary" asChild>
            <Link href="/dashboard/settings">Edit profile</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getUTCHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** "https://news.ycombinator.com/item?id=1" → "news.ycombinator.com" */
function prettifyReferrer(referrer: string): string {
  if (referrer === "Direct" || !referrer) return "Direct";
  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return referrer.slice(0, 40);
  }
}
