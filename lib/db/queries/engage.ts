/**
 * lib/db/queries/engage.ts — claps, bookmarks, comments and view tracking.
 *
 * Each mutation writes the row *and* the denormalised counter on `posts` in a
 * single Neon transaction, so a reader never sees a count that disagrees with
 * the rows behind it.
 */

import { query, queryOne, transaction } from '@/lib/db';
import type { CommentRow, PostCard } from './types';

/* ------------------------------------------------------------------ claps */

/** Adds one clap. Returns the new total for optimistic UI. */
export async function addClap(postId: number, userId: number): Promise<number> {
  await transaction([
    {
      text: `insert into claps (post_id, user_id, count) values ($1, $2, 1)
             on conflict (post_id, user_id) do update set count = claps.count + 1`,
      params: [postId, userId],
    },
    { text: `update posts set clap_count = clap_count + 1 where id = $1`, params: [postId] },
  ]);
  return readClapCount(postId);
}

/** Removes every clap the reader gave. Returns the new total. */
export async function removeClaps(postId: number, userId: number): Promise<number> {
  const removed = await queryOne<{ total: number | null }>(
    `select sum(count) as total from claps where post_id = $1 and user_id = $2`,
    [postId, userId],
  );
  const delta = removed?.total ?? 0;
  await transaction([
    { text: `delete from claps where post_id = $1 and user_id = $2`, params: [postId, userId] },
    {
      text: `update posts set clap_count = greatest(clap_count - $2, 0) where id = $1`,
      params: [postId, delta],
    },
  ]);
  return readClapCount(postId);
}

export async function readClapCount(postId: number): Promise<number> {
  const row = await queryOne<{ clap_count: number }>(`select clap_count from posts where id = $1`, [postId]);
  return row?.clap_count ?? 0;
}

export async function getReaderClaps(postId: number, userId: number): Promise<number> {
  const row = await queryOne<{ total: number | null }>(
    `select sum(count) as total from claps where post_id = $1 and user_id = $2`,
    [postId, userId],
  );
  return row?.total ?? 0;
}

/* -------------------------------------------------------------- bookmarks */

export async function toggleBookmark(postId: number, userId: number): Promise<boolean> {
  const existing = await queryOne<{ post_id: number }>(
    `select post_id from bookmarks where post_id = $1 and user_id = $2 limit 1`,
    [postId, userId],
  );
  if (existing) {
    await query(`delete from bookmarks where post_id = $1 and user_id = $2`, [postId, userId]);
    return false;
  }
  await query(
    `insert into bookmarks (post_id, user_id) values ($1, $2) on conflict (post_id, user_id) do nothing`,
    [postId, userId],
  );
  return true;
}

/* --------------------------------------------------------------- comments */

export async function addComment(input: {
  postId: number;
  userId: number;
  body: string;
  parentId?: number | null;
}): Promise<CommentRow | null> {
  // A Neon transaction resolves with the result of its LAST statement, so the
  // counter update goes first and the `RETURNING` insert goes last.
  const rows = await transaction<{ id: number }>([
    {
      text: `update posts set comment_count = comment_count + 1 where id = $1`,
      params: [input.postId],
    },
    {
      text: `insert into comments (post_id, user_id, parent_id, body)
             values ($1, $2, $3, $4)
             returning id`,
      params: [input.postId, input.userId, input.parentId ?? null, input.body],
    },
  ]);
  const created = rows[0];
  if (!created) return null;
  return queryOne<CommentRow>(
    `select c.id, c.post_id, c.user_id, c.parent_id, c.body, c.created_at,
            u.username, u.display_name, u.avatar_url
     from comments c
     join users u on u.id = c.user_id
     where c.id = $1
     limit 1`,
    [created.id],
  );
}

export function listComments(postId: number, limit = 100): Promise<CommentRow[]> {
  return query<CommentRow>(
    `select c.id, c.post_id, c.user_id, c.parent_id, c.body, c.created_at,
            u.username, u.display_name, u.avatar_url
     from comments c
     join users u on u.id = c.user_id
     where c.post_id = $1
     order by c.created_at asc
     limit $2`,
    [postId, limit],
  );
}

/**
 * Deleting a comment can cascade to its replies, so the counter is recounted
 * from the rows that actually survived instead of being decremented by one.
 * That makes the count self-healing even after a cascade.
 */
export async function deleteComment(id: number, userId: number): Promise<void> {
  const removed = await queryOne<{ post_id: number }>(
    `delete from comments where id = $1 and user_id = $2 returning post_id`,
    [id, userId],
  );
  if (!removed) return;
  await query(
    `update posts
     set comment_count = (select count(*) from comments where post_id = $1)
     where id = $1`,
    [removed.post_id],
  );
}

/* ------------------------------------------------------------ view counts */

/**
 * Append-only analytics. One row per (post, reader, UTC day), enforced by a
 * unique constraint, so `insert … on conflict do nothing` doubles as the
 * de-duplicator *and* the "is this a new view?" probe.
 */
export async function recordView(postId: number, viewerKey: string): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const inserted = await queryOne<{ id: number }>(
    `insert into post_views (post_id, viewer_key, day)
     values ($1, $2, $3)
     on conflict (post_id, viewer_key, day) do nothing
     returning id`,
    [postId, viewerKey, day],
  );
  if (!inserted) return false;
  await query(`update posts set view_count = view_count + 1 where id = $1`, [postId]);
  return true;
}

/** Posts a reader has clapped, newest first — used by the profile "activity" rail. */
export function listClappedPosts(userId: number, limit = 12): Promise<PostCard[]> {
  return query<PostCard>(
    `select p.id, p.slug, p.title, p.subtitle, p.excerpt, p.cover_url,
            p.word_count, p.read_minutes, p.view_count, p.clap_count, p.comment_count,
            p.published_at, p.created_at, p.status,
            u.id as author_id, u.username, u.display_name, u.avatar_url,
            array_agg(tg.name) filter (where tg.name is not null) as tags,
            true as clapped,
            case when exists (
              select 1 from bookmarks bm where bm.post_id = p.id and bm.user_id = $1
            ) then true else false end as bookmarked
     from claps cl
     join posts p on p.id = cl.post_id
     join users u on u.id = p.author_id
     left join post_tags pt on pt.post_id = p.id
     left join tags tg on tg.id = pt.tag_id
     where cl.user_id = $1
     group by p.id, u.id, cl.created_at
     order by cl.created_at desc, p.id desc
     limit $2`,
    [userId, limit],
  );
}
