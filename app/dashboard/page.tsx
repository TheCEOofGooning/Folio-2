import Link from 'next/link';
import { Sparkline } from '@/components/sparkline';
import { ClapIcon, ClockIcon, CommentIcon, EyeIcon, UserIcon } from '@/components/icons';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/auth/session';
import { getAuthorStats, getTopPosts, getViewSeries } from '@/lib/db/queries/stats';
import { formatCount } from '@/lib/utils/format';

function Stat({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        <span className="text-muted">{icon}</span>
      </div>
      <p className="mt-2 font-serif text-3xl tracking-tight text-ink tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-[13px] text-muted">{hint}</p> : null}
    </div>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [stats, series, top] = await Promise.all([
    getAuthorStats(user.id),
    getViewSeries(user.id, 30),
    getTopPosts(user.id, 5),
  ]);

  const days = 30;
  const byDay = new Map(series.map((bucket) => [bucket.day, Number(bucket.views)]));
  const now = Date.now();
  const filled = Array.from({ length: days }, (_, index) => {
    const day = new Date(now - (days - 1 - index) * 86_400_000).toISOString().slice(0, 10);
    return { day, views: byDay.get(day) ?? 0 };
  });

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total views" value={formatCount(stats.total_views)} icon={<EyeIcon size={17} />} />
        <Stat
          label="Unique readers"
          value={formatCount(stats.total_readers)}
          icon={<UserIcon size={17} />}
          hint="De-duplicated per day"
        />
        <Stat label="Claps" value={formatCount(stats.total_claps)} icon={<ClapIcon size={17} />} />
        <Stat
          label="Responses"
          value={formatCount(stats.total_comments)}
          icon={<CommentIcon size={17} />}
          hint={`${formatCount(stats.total_read_minutes)} minutes of reading time`}
        />
      </div>

      <section className="rounded-2xl border border-line bg-surface p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="font-serif text-xl text-ink">Views</h2>
            <p className="text-[13px] text-muted">Last 30 days</p>
          </div>
          <p className="text-[13px] text-muted tabular-nums">
            Peak {formatCount(Math.max(...filled.map((bucket) => bucket.views), 0))}/day
          </p>
        </div>
        <Sparkline values={filled.map((bucket) => bucket.views)} labels={filled.map((bucket) => bucket.day)} />
      </section>

      <section>
        <h2 className="mb-4 font-serif text-xl text-ink">Top stories</h2>
        {top.length === 0 ? (
          <EmptyState
            icon={<ClockIcon size={26} />}
            title="No published stories yet"
            description="Publish your first piece and its analytics will show up here within a minute."
            action={<ButtonLink href="/write">Write a story</ButtonLink>}
          />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {top.map((post) => (
              <li key={post.id} className="flex items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/p/${post.slug}`} className="truncate font-medium text-ink hover:text-accent">
                    {post.title}
                  </Link>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {post.read_minutes} min read · {formatCount(post.word_count)} words
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-[13px] text-muted tabular-nums">
                  <span className="inline-flex items-center gap-1.5">
                    <EyeIcon size={14} /> {formatCount(post.view_count)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <ClapIcon size={14} /> {formatCount(post.clap_count)}
                  </span>
                  <span className="hidden items-center gap-1.5 sm:inline-flex">
                    <CommentIcon size={14} /> {formatCount(post.comment_count)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
