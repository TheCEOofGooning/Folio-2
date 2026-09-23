/**
 * lib/db/queries/stats.ts — the creator analytics dashboard.
 *
 * Three statements cover the whole screen: lifetime totals, a daily views
 * series for the sparkline, and the per-post leaderboard.
 */

import { query, queryOne } from '@/lib/db';
import type { AuthorStats, CreatorPostRow, ViewBucket } from './types';

export async function getAuthorStats(authorId: number): Promise<AuthorStats> {
  const row = await queryOne<{
    total_views: number | null;
    total_claps: number | null;
    total_comments: number | null;
    total_read_minutes: number | null;
    published: number | null;
    drafts: number | null;
    total_readers: number | null;
  }>(
    `select coalesce(sum(p.view_count), 0)    as total_views,
            coalesce(sum(p.clap_count), 0)   as total_claps,
            coalesce(sum(p.comment_count), 0) as total_comments,
            coalesce(sum(p.read_minutes), 0) as total_read_minutes,
            count(case when p.status = $2 then 1 end) as published,
            count(case when p.status = $3 then 1 end) as drafts,
            (select count(distinct pv.viewer_key)
             from post_views pv
             join posts p2 on p2.id = pv.post_id
             where p2.author_id = $1) as total_readers
     from posts p
     where p.author_id = $1`,
    [authorId, 'published', 'draft'],
  );

  return {
    total_views: row?.total_views ?? 0,
    total_claps: row?.total_claps ?? 0,
    total_comments: row?.total_comments ?? 0,
    total_read_minutes: row?.total_read_minutes ?? 0,
    published: row?.published ?? 0,
    drafts: row?.drafts ?? 0,
    total_readers: row?.total_readers ?? 0,
  };
}

/** Daily view counts, oldest → newest, padded by the caller if needed. */
export async function getViewSeries(authorId: number, days = 30, postId?: number): Promise<ViewBucket[]> {
  const rows = await query<ViewBucket>(
    `select pv.day::text as day, count(*) as views
     from post_views pv
     join posts p on p.id = pv.post_id
     where p.author_id = $1 and ($2::bigint is null or pv.post_id = $2)
     group by pv.day
     order by pv.day desc
     limit $3`,
    [authorId, postId ?? null, days],
  );
  return rows.reverse();
}

export function getTopPosts(authorId: number, limit = 5): Promise<CreatorPostRow[]> {
  return query<CreatorPostRow>(
    `select id, slug, title, status, cover_url, view_count, clap_count, comment_count,
            read_minutes, word_count, published_at, created_at, updated_at
     from posts
     where author_id = $1 and status = $2
     order by view_count desc, clap_count desc
     limit $3`,
    [authorId, 'published', limit],
  );
}

/** Per-post totals for the analytics table. */
export function getPostBreakdown(authorId: number, limit = 50): Promise<CreatorPostRow[]> {
  return query<CreatorPostRow>(
    `select id, slug, title, status, cover_url, view_count, clap_count, comment_count,
            read_minutes, word_count, published_at, created_at, updated_at
     from posts
     where author_id = $1
     order by view_count desc
     limit $2`,
    [authorId, limit],
  );
}
