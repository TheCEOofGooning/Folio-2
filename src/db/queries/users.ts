/**
 * Accounts, public profiles and creator analytics.
 *
 * Everything here is either (a) a single-row read by a unique index, or (b) an
 * aggregate computed in Postgres rather than by shipping rows to Node and
 * reducing them in JavaScript. `post_views` grows with traffic, so the analytics
 * functions are the ones that most need to stay in the database.
 */
import { sql, maybe, many } from "@/db";
import type { SessionUser, ProfileRow, DashboardStats, AnalyticsRow, AuthorSummary } from "@/db/types";

export interface CreateUserInput {
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
  avatarHue: number;
}

export async function createUser(input: CreateUserInput): Promise<SessionUser> {
  const row = await maybe<SessionUser>(sql`
    insert into users (email, username, display_name, password_hash, avatar_hue)
    values (${input.email}, ${input.username}, ${input.displayName},
            ${input.passwordHash}, ${input.avatarHue})
    returning id, email, username, display_name as "displayName",
              avatar_url as "avatarUrl", avatar_hue as "avatarHue"
  `);
  if (!row) throw new Error("Could not create account");
  return row;
}

/** Login lookup — case-insensitive on both identifiers, one index scan. */
export async function getUserForLogin(
  identifier: string,
): Promise<(SessionUser & { passwordHash: string }) | null> {
  return maybe<SessionUser & { passwordHash: string }>(sql`
    select id, email, username, display_name as "displayName",
           avatar_url as "avatarUrl", avatar_hue as "avatarHue",
           password_hash as "passwordHash"
      from users
     where lower(email) = lower(${identifier}) or lower(username) = lower(${identifier})
     limit 1
  `);
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const row = await maybe<{ taken: boolean }>(sql`
    select exists(select 1 from users where lower(username) = lower(${username})) as taken
  `);
  return row?.taken ?? false;
}

export async function isEmailTaken(email: string): Promise<boolean> {
  const row = await maybe<{ taken: boolean }>(sql`
    select exists(select 1 from users where lower(email) = lower(${email})) as taken
  `);
  return row?.taken ?? false;
}

/**
 * Rotates the password hash and revokes every existing session in one statement.
 *
 * Session rows are the revocation handle for the signed cookie, so deleting them
 * here is what makes "change password" also mean "sign out everywhere" — a
 * stolen cookie stops working immediately.
 */
export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  await sql`
    with rot as (
      update users
         set password_hash = ${passwordHash}, updated_at = now()
       where id = ${userId}::uuid
      returning id
    )
    delete from sessions where user_id = (select id from rot)
  `;
}

export async function updateProfile(
  userId: string,
  input: { displayName: string; bio: string; tagline: string; avatarUrl: string | null },
): Promise<SessionUser | null> {
  return maybe<SessionUser>(sql`
    update users
       set display_name = ${input.displayName},
           bio          = ${input.bio},
           tagline      = ${input.tagline},
           avatar_url   = ${input.avatarUrl},
           updated_at   = now()
     where id = ${userId}::uuid
    returning id, email, username, display_name as "displayName",
              avatar_url as "avatarUrl", avatar_hue as "avatarHue"
  `);
}

/**
 * Public profile header.
 *
 * Five scalars that all come from different tables, resolved as correlated
 * sub-selects inside one statement — which is dramatically cheaper than four
 * round trips to a pooled serverless database.
 */
export async function getProfile(
  username: string,
  viewerId: string | null = null,
): Promise<ProfileRow | null> {
  return maybe<ProfileRow>(sql`
    select u.id,
           u.username,
           u.display_name as "displayName",
           u.bio,
           u.tagline,
           u.avatar_url   as "avatarUrl",
           u.avatar_hue   as "avatarHue",
           u.created_at   as "createdAt",
           (select count(*)::int from posts p
             where p.author_id = u.id and p.status = 'published')          as "postCount",
           (select count(*)::int from follows f where f.following_id = u.id) as "followerCount",
           (select count(*)::int from follows f where f.follower_id = u.id)  as "followingCount",
           (select coalesce(sum(p.clap_count), 0)::int from posts p
             where p.author_id = u.id and p.status = 'published')          as "totalClaps",
           (select coalesce(sum(p.view_count), 0)::int from posts p
             where p.author_id = u.id and p.status = 'published')          as "totalReads",
           exists(select 1 from follows f
                   where f.follower_id = ${viewerId}::uuid and f.following_id = u.id)
             as "viewerFollowing"
      from users u
     where lower(u.username) = lower(${username})
     limit 1
  `);
}

/** Authors worth following — used on the landing page and explore rail. */
export async function getNotableAuthors(limit = 6): Promise<(AuthorSummary & { postCount: number; totalClaps: number })[]> {
  return many<AuthorSummary & { postCount: number; totalClaps: number }>(sql`
    select u.id, u.username, u.display_name as "displayName",
           u.avatar_url as "avatarUrl", u.avatar_hue as "avatarHue",
           u.bio, u.tagline,
           count(p.id)::int                          as "postCount",
           coalesce(sum(p.clap_count), 0)::int       as "totalClaps"
      from users u
      join posts p on p.author_id = u.id and p.status = 'published'
     group by u.id
     having count(p.id) > 0
     order by coalesce(sum(p.clap_count), 0) desc, count(p.id) desc
     limit ${limit}
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Creator analytics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-post performance.
 *
 * `post_views` is the fact table; everything else is aggregated in the same
 * pass. `left join` keeps drafts (which have no views yet) in the list so the
 * dashboard looks the same on day one as on day one hundred.
 *
 * `readingNow` counts heartbeats from the last two minutes — a live gauge that
 * costs nothing extra because the beacon already writes `updated_at`.
 */
export async function getAuthorAnalytics(authorId: string): Promise<AnalyticsRow[]> {
  return many<AnalyticsRow>(sql`
    select p.id            as "postId",
           p.title,
           p.slug,
           p.status,
           p.published_at  as "publishedAt",
           p.view_count    as "views",
           count(v.post_id)::int                                             as "readers",
           p.clap_count    as "claps",
           p.comment_count as "comments",
           coalesce(round(avg(v.read_seconds) filter (where v.read_seconds > 0)), 0)::int as "avgReadSeconds",
           coalesce(avg(v.read_ratio), 0)::float8                            as "avgReadRatio",
           coalesce(
             count(*) filter (where v.read_ratio >= 0.9)::float8 / nullif(count(v.post_id), 0),
             0
           )::float8                                                         as "completionRate",
           count(*) filter (where v.updated_at > now() - interval '2 minutes')::int as "readingNow"
      from posts p
      left join post_views v on v.post_id = p.id
     where p.author_id = ${authorId}::uuid
     group by p.id
     order by coalesce(p.published_at, p.updated_at) desc
  `);
}

/** Header numbers for the dashboard. One statement, eight scalars. */
export async function getDashboardStats(authorId: string): Promise<DashboardStats> {
  const row = await maybe<DashboardStats>(sql`
    select
      (select count(*)::int from posts where author_id = ${authorId}::uuid and status = 'published') as "publishedCount",
      (select count(*)::int from posts where author_id = ${authorId}::uuid and status = 'draft')     as "draftCount",
      (select coalesce(sum(view_count), 0)::int from posts where author_id = ${authorId}::uuid)      as "totalViews",
      (select coalesce(sum(read_seconds), 0)::int
         from post_views v join posts p on p.id = v.post_id
        where p.author_id = ${authorId}::uuid)                                                      as "totalReads",
      (select coalesce(sum(clap_count), 0)::int from posts where author_id = ${authorId}::uuid)      as "totalClaps",
      (select coalesce(sum(comment_count), 0)::int from posts where author_id = ${authorId}::uuid)   as "totalComments",
      (select count(*)::int from follows where following_id = ${authorId}::uuid)                     as "followers",
      (select coalesce(avg(read_seconds), 0)::int
         from post_views v join posts p on p.id = v.post_id
        where p.author_id = ${authorId}::uuid and v.read_seconds > 0)                               as "avgReadSeconds"
  `);
  return (
    row ?? {
      publishedCount: 0,
      draftCount: 0,
      totalViews: 0,
      totalReads: 0,
      totalClaps: 0,
      totalComments: 0,
      followers: 0,
      avgReadSeconds: 0,
    }
  );
}

export interface TrafficPoint {
  day: string;
  readers: number;
  seconds: number;
}

/**
 * 30-day reader trend for the dashboard sparkline.
 * `generate_series` fills gaps so the chart never has holes on quiet days.
 */
export async function getAuthorTraffic(authorId: string, days = 30): Promise<TrafficPoint[]> {
  return many<TrafficPoint>(sql`
    with window_days as (
      select generate_series(
        (current_date - (${days - 1}::int || ' days')::interval)::date,
        current_date,
        interval '1 day'
      )::date as day
    ),
    daily as (
      select v.created_at::date as day,
             count(*)::int      as readers,
             coalesce(sum(v.read_seconds), 0)::int as seconds
        from post_views v
        join posts p on p.id = v.post_id
       where p.author_id = ${authorId}::uuid
         and v.created_at >= current_date - (${days - 1}::int || ' days')::interval
       group by 1
    )
    select to_char(w.day, 'YYYY-MM-DD') as day,
           coalesce(d.readers, 0) as readers,
           coalesce(d.seconds, 0) as seconds
      from window_days w
      left join daily d on d.day = w.day
     order by w.day asc
  `);
}

/** Referrer breakdown — where readers actually come from. */
export async function getAuthorReferrers(authorId: string, limit = 5): Promise<{ referrer: string; readers: number }[]> {
  return many<{ referrer: string; readers: number }>(sql`
    select case when v.referrer = '' then 'Direct' else v.referrer end as referrer,
           count(*)::int as readers
      from post_views v
      join posts p on p.id = v.post_id
     where p.author_id = ${authorId}::uuid
     group by 1
     order by readers desc
     limit ${limit}
  `);
}
