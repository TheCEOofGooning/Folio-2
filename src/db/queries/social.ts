/**
 * Engagement: claps, bookmarks, follows, comments, reading telemetry.
 *
 * ── The statelessness rule ────────────────────────────────────────────────────
 * Neon's HTTP endpoint is stateless: two calls may land on different pooled
 * connections, so `BEGIN … COMMIT` across calls is not available. Every write
 * here is therefore **one statement** that touches every table it needs, using
 * data-modifying CTEs. Each one is atomic by construction, not by convention.
 *
 * Counters on `posts` are denormalised for the read path. Because they are
 * updated in the same statement as the row that causes them, they cannot drift —
 * compared with the alternative (aggregate per render), this removes a join and
 * a `sum()` from every feed query and every article view.
 */
import { sql, maybe, many } from "@/db";
import { AUTHOR_COLUMNS } from "@/db/columns";
import type { CommentWithReplies, CommentNode, PostCard } from "@/db/types";
import { POST_CARD_COLUMNS } from "@/db/columns";

export const MAX_CLAPS_PER_READER = 50;

// ─────────────────────────────────────────────────────────────────────────────
//  Claps
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sets a reader's clap total for a post (1–50) and adjusts the post counter by
 * exactly the delta.
 *
 * The `prev` CTE reads the pre-statement snapshot (so it sees the old value),
 * `ins` performs the upsert and returns the new value, and the outer UPDATE
 * applies `new - old` to the denormalised counter. One statement, two tables,
 * no way to double-count a retry — the operation is idempotent because the client
 * sends an absolute total rather than a "+1" instruction.
 */
export async function setClap(
  postId: string,
  userId: string,
  total: number,
): Promise<{ clapCount: number; yourClaps: number } | null> {
  const desired = Math.max(0, Math.min(MAX_CLAPS_PER_READER, Math.trunc(total)));

  const row = await maybe<{ clapCount: number; yourClaps: number }>(sql`
    with prev as (
      select coalesce(count, 0) as before
        from claps
       where post_id = ${postId}::uuid and user_id = ${userId}::uuid
    ),
    ins as (
      insert into claps (post_id, user_id, count)
      values (${postId}::uuid, ${userId}::uuid, ${desired})
      on conflict (post_id, user_id)
        do update set count = excluded.count, updated_at = now()
      returning count
    )
    update posts p
       set clap_count = greatest(0, p.clap_count
                                  - (select before from prev)
                                  + (select count from ins))
     where p.id = ${postId}::uuid
    returning p.clap_count as "clapCount", (select count from ins)::int as "yourClaps"
  `);

  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Bookmarks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Toggle in a single round trip: `del` removes the row if present, `ins` inserts
 * only when nothing was deleted. `del`'s RETURNING output is visible to `ins`,
 * which is what makes the branch decidable without a second query.
 */
export async function toggleBookmark(postId: string, userId: string): Promise<boolean> {
  const row = await maybe<{ bookmarked: boolean }>(sql`
    with del as (
      delete from bookmarks
       where user_id = ${userId}::uuid and post_id = ${postId}::uuid
      returning 1
    ),
    ins as (
      insert into bookmarks (user_id, post_id)
      select ${userId}::uuid, ${postId}::uuid
       where not exists (select 1 from del)
      on conflict do nothing
      returning 1
    )
    select exists(select 1 from ins) as bookmarked
  `);
  return row?.bookmarked ?? false;
}

export async function isBookmarked(postId: string, userId: string): Promise<boolean> {
  const row = await maybe<{ bookmarked: boolean }>(sql`
    select exists(
      select 1 from bookmarks where user_id = ${userId}::uuid and post_id = ${postId}::uuid
    ) as bookmarked
  `);
  return row?.bookmarked ?? false;
}

export async function getBookmarkedPosts(userId: string, limit = 30): Promise<PostCard[]> {
  return many<PostCard>(sql`
    select ${POST_CARD_COLUMNS}, b.created_at as "bookmarkedAt"
      from bookmarks b
      join posts p on p.id = b.post_id
      join users u on u.id = p.author_id
     where b.user_id = ${userId}::uuid
     order by b.created_at desc
     limit ${limit}
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Follows
// ─────────────────────────────────────────────────────────────────────────────

export async function toggleFollow(followingId: string, followerId: string): Promise<boolean> {
  if (followingId === followerId) return false;

  const row = await maybe<{ following: boolean }>(sql`
    with del as (
      delete from follows
       where follower_id = ${followerId}::uuid and following_id = ${followingId}::uuid
      returning 1
    ),
    ins as (
      insert into follows (follower_id, following_id)
      select ${followerId}::uuid, ${followingId}::uuid
       where not exists (select 1 from del)
      on conflict do nothing
      returning 1
    )
    select exists(select 1 from ins) as following
  `);
  return row?.following ?? false;
}

export async function getFollowedUsernames(userId: string): Promise<string[]> {
  const rows = await many<{ username: string }>(sql`
    select u.username
      from follows f
      join users u on u.id = f.following_id
     where f.follower_id = ${userId}::uuid
     order by f.created_at desc
  `);
  return rows.map((row) => row.username);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Comments
// ─────────────────────────────────────────────────────────────────────────────

/** Flat fetch, threaded in memory — one query regardless of thread depth. */
export async function getComments(postId: string): Promise<CommentWithReplies[]> {
  const rows = await many<CommentNode>(sql`
    select c.id, c.body, c.parent_id as "parentId", c.edited,
           c.created_at as "createdAt", c.updated_at as "updatedAt",
           ${AUTHOR_COLUMNS}
      from comments c
      join users u on u.id = c.author_id
     where c.post_id = ${postId}::uuid
     order by c.created_at asc
  `);

  const roots: CommentWithReplies[] = [];
  const index = new Map<string, CommentWithReplies>();

  for (const row of rows) {
    const node: CommentWithReplies = { ...row, replies: [] };
    index.set(node.id, node);
    if (node.parentId && index.has(node.parentId)) {
      index.get(node.parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  // Newest threads first; replies stay chronological inside a thread.
  return roots.reverse();
}

/** Insert + counter bump in one statement — the comment can never be uncounted. */
export async function addComment(
  postId: string,
  authorId: string,
  body: string,
  parentId: string | null = null,
): Promise<{ id: string; createdAt: string; commentCount: number } | null> {
  const row = await maybe<{ id: string; createdAt: string; commentCount: number }>(sql`
    with ins as (
      insert into comments (post_id, author_id, parent_id, body)
      values (${postId}::uuid, ${authorId}::uuid, ${parentId}::uuid, ${body})
      returning id, post_id, created_at
    )
    update posts p
       set comment_count = p.comment_count + 1
      from ins
     where p.id = ins.post_id
    returning (select id from ins) as id,
              (select created_at from ins) as "createdAt",
              p.comment_count as "commentCount"
  `);
  return row;
}

/**
 * Authors may delete their own comments; post owners may moderate any comment on
 * their post. Authorised in SQL so the check and the delete cannot disagree.
 */
export async function deleteComment(
  commentId: string,
  viewerId: string,
): Promise<{ postId: string; commentCount: number } | null> {
  const row = await maybe<{ postId: string; commentCount: number }>(sql`
    with target as (
      select c.id, c.post_id
        from comments c
        join posts p on p.id = c.post_id
       where c.id = ${commentId}::uuid
         and (c.author_id = ${viewerId}::uuid or p.author_id = ${viewerId}::uuid)
    ),
    del as (
      delete from comments c
       using target t
       where c.id = t.id
      returning c.post_id
    )
    update posts p
       set comment_count = greatest(0, p.comment_count - 1)
      from del
     where p.id = del.post_id
    returning p.id as "postId", p.comment_count as "commentCount"
  `);
  return row;
}

/**
 * Engagement snapshot for one reader.
 *
 * Four scalars from four tables in a single statement, with the viewer-relative
 * parts expressed as joins on the viewer id — so an anonymous reader simply gets
 * zeroes rather than needing a second code path.
 */
export async function getEngagement(
  postId: string,
  viewerId: string | null,
): Promise<{
  claps: number;
  views: number;
  comments: number;
  yourClaps: number;
  bookmarked: boolean;
  followingAuthor: boolean;
} | null> {
  return maybe(sql`
    select p.clap_count    as claps,
           p.view_count    as views,
           p.comment_count as comments,
           coalesce(c.count, 0)::int          as "yourClaps",
           (b.user_id is not null)            as bookmarked,
           (f.follower_id is not null)        as "followingAuthor"
      from posts p
      left join claps c
        on c.post_id = p.id and c.user_id = ${viewerId}::uuid
      left join bookmarks b
        on b.post_id = p.id and b.user_id = ${viewerId}::uuid
      left join follows f
        on f.following_id = p.author_id and f.follower_id = ${viewerId}::uuid
     where p.id = ${postId}::uuid
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Reading telemetry
// ─────────────────────────────────────────────────────────────────────────────

export interface ReadingBeacon {
  postId: string;
  viewerHash: string;
  userId: string | null;
  /** Seconds of active reading accumulated since the last beacon. */
  seconds: number;
  /** Furthest scroll depth reached, 0–1. */
  ratio: number;
  referrer?: string;
}

/**
 * Heartbeat ingest. Called from the reader with `sendBeacon`, so it must be
 * cheap, idempotent-ish and tolerant of duplicates.
 *
 * `view_count` increments only when a *new* reader is inserted — that is what
 * `(xmax = 0)` detects. A reader refreshing ten times still counts once; the
 * `post_views` row accumulates their real time-on-page instead.
 */
export async function recordReading(beacon: ReadingBeacon): Promise<number | null> {
  const seconds = Math.max(0, Math.min(Math.trunc(beacon.seconds), 7200));
  const ratio = Math.max(0, Math.min(beacon.ratio, 1));

  const row = await maybe<{ viewCount: number }>(sql`
    with upsert as (
      insert into post_views (post_id, viewer_hash, user_id, read_seconds, read_ratio, referrer)
      values (${beacon.postId}::uuid, ${beacon.viewerHash}, ${beacon.userId}::uuid,
              ${seconds}, ${ratio}, ${(beacon.referrer ?? "").slice(0, 200)})
      on conflict (post_id, viewer_hash) do update
        set read_seconds = least(post_views.read_seconds + excluded.read_seconds, 86400),
            read_ratio   = greatest(post_views.read_ratio, excluded.read_ratio),
            user_id      = coalesce(excluded.user_id, post_views.user_id),
            updated_at   = now()
      returning (xmax = 0) as is_new
    )
    update posts p
       set view_count = p.view_count + (select case when is_new then 1 else 0 end from upsert)
     where p.id = ${beacon.postId}::uuid
    returning p.view_count as "viewCount"
  `);

  return row?.viewCount ?? null;
}

/** Signed-in readers get a resumable position in their library. */
export async function recordProgress(postId: string, userId: string, progress: number): Promise<void> {
  await sql`
    insert into reading_history (user_id, post_id, progress, last_read_at)
    values (${userId}::uuid, ${postId}::uuid, ${Math.max(0, Math.min(progress, 1))}, now())
    on conflict (user_id, post_id)
      do update set progress = excluded.progress, last_read_at = now()
  `;
}

export interface HistoryEntry extends PostCard {
  progress: number;
  lastReadAt: string;
}

export async function getReadingHistory(userId: string, limit = 12): Promise<HistoryEntry[]> {
  return many<HistoryEntry>(sql`
    select ${POST_CARD_COLUMNS}, h.progress, h.last_read_at as "lastReadAt"
      from reading_history h
      join posts p on p.id = h.post_id
      join users u on u.id = p.author_id
     where h.user_id = ${userId}::uuid
     order by h.last_read_at desc
     limit ${limit}
  `);
}

export async function clearReadingHistory(userId: string): Promise<void> {
  await sql`delete from reading_history where user_id = ${userId}::uuid`;
}
