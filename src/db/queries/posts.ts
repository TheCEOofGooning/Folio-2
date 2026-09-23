/**
 * Post reads and writes.
 *
 * Read functions are viewer-agnostic wherever possible so their results can be
 * cached (ISR / `unstable_cache`) and shared by every visitor. Viewer-specific
 * state (did *I* clap this?) is resolved by `queries/social.ts` on demand for
 * signed-in readers only — which is why anonymous page views hit a warm cache
 * and never touch Postgres at all.
 */
import { sql, maybe, many, type SqlParam } from "@/db";
import { POST_CARD_COLUMNS, TRENDING_SCORE } from "@/db/columns";
import { slugify } from "@/lib/utils";
import type { PostCard, PostDetail, DraftSummary } from "@/db/types";

export type FeedSort = "latest" | "trending" | "discussed";

export interface FeedOptions {
  limit?: number;
  offset?: number;
  tag?: string | null;
  sort?: FeedSort;
  /** Restrict to a set of author usernames (the "following" feed). */
  usernames?: string[];
  excludeIds?: string[];
}

const ORDER_BY: Record<FeedSort, string> = {
  latest: "p.published_at desc nulls last, p.created_at desc",
  trending: `${TRENDING_SCORE.text} desc, p.clap_count desc`,
  discussed: "p.comment_count desc, p.published_at desc nulls last",
};

/**
 * The main feed. One query, one round trip, no N+1: tags, author, counters and
 * excerpt all come back with the row.
 */
export async function getFeed(options: FeedOptions = {}): Promise<PostCard[]> {
  const { limit = 12, offset = 0, tag = null, sort = "latest", usernames, excludeIds } = options;

  return many<PostCard>(sql`
    select ${POST_CARD_COLUMNS}
      from posts p
      join users u on u.id = p.author_id
     where p.status = 'published'
       and (${tag}::text is null or ${tag ?? ""}::text = any (p.tags))
       and (${usernames ? sql.array(usernames, "text") : null}::text[] is null
            or u.username = any (${usernames ? sql.array(usernames, "text") : null}::text[]))
       and (${excludeIds ? sql.array(excludeIds, "uuid") : null}::uuid[] is null
            or p.id <> all (${excludeIds ? sql.array(excludeIds, "uuid") : null}::uuid[]))
     order by ${sql.raw(ORDER_BY[sort])}
     limit ${Math.min(Math.max(limit, 1), 50)}
     offset ${Math.max(offset, 0)}
  `);
}

/** Featured / hero picks for the landing page. */
export async function getFeaturedPosts(limit = 3): Promise<PostCard[]> {
  return many<PostCard>(sql`
    select ${POST_CARD_COLUMNS}
      from posts p
      join users u on u.id = p.author_id
     where p.status = 'published'
     order by p.featured desc, ${TRENDING_SCORE} desc
     limit ${Math.min(Math.max(limit, 1), 12)}
  `);
}

/**
 * Full article with viewer-relative state in the same statement.
 *
 * `viewerId` is intentionally NOT part of the cached projection: pages call this
 * with `null` (cacheable) and the engagement island re-queries with the real id.
 */
export async function getPostBySlug(slug: string, viewerId: string | null = null): Promise<PostDetail | null> {
  return maybe<PostDetail>(sql`
    select ${POST_CARD_COLUMNS},
           p.content,
           coalesce(v.claps, 0)::int          as "viewerClaps",
           (v.viewer_id is not null)          as "viewerBookmarked",
           (f.follower_id is not null)        as "viewerFollowingAuthor",
           (select count(*)::int from posts q
             where q.author_id = p.author_id and q.status = 'published') as "authorPosts",
           (select count(*)::int from follows fl where fl.following_id = p.author_id) as "authorFollowers"
      from posts p
      join users u on u.id = p.author_id
      left join lateral (
        select c.count as claps, c.user_id as viewer_id
          from claps c
         where c.post_id = p.id and c.user_id = ${viewerId}::uuid
      ) v on true
      left join follows f
        on f.following_id = p.author_id and f.follower_id = ${viewerId}::uuid
     where p.slug = ${slug}
       -- Published and unlisted articles are world-readable; drafts are visible
       -- only to their author (checked in SQL so no caller can forget the rule).
       and (p.status <> 'draft' or p.author_id = ${viewerId}::uuid)
     limit 1
  `);
}

/** Cheap existence + ownership check used by server actions. */
export async function getPostOwnership(
  postId: string,
): Promise<{ id: string; authorId: string; slug: string; status: string } | null> {
  return maybe(sql`
    select p.id, p.author_id as "authorId", p.slug, p.status
      from posts p
     where p.id = ${postId}::uuid
  `);
}

/** Same, by slug — the editor route only knows the slug. */
export async function getPostOwnershipBySlug(
  slug: string,
): Promise<{ id: string; authorId: string; slug: string; status: string } | null> {
  return maybe(sql`
    select p.id, p.author_id as "authorId", p.slug, p.status
      from posts p
     where p.slug = ${slug}
  `);
}

export interface SearchOptions {
  query?: string | null;
  tag?: string | null;
  sort?: FeedSort;
  limit?: number;
  offset?: number;
}

/**
 * Search across title, subtitle, excerpt and body.
 *
 * Ranked with `ts_rank`-like heuristics expressed as plain CASE weights (title
 * beats body), which avoids maintaining a tsvector column for a corpus this size.
 * `pg_trgm` indexes (see schema.sql) keep the ILIKE predicates fast as the
 * publication grows.
 */
export async function searchPosts(options: SearchOptions = {}): Promise<PostCard[]> {
  const { query: term = null, tag = null, sort = "latest", limit = 20, offset = 0 } = options;
  const pattern = term ? `%${term.trim()}%` : null;

  return many<PostCard>(sql`
    select ${POST_CARD_COLUMNS}
      from posts p
      join users u on u.id = p.author_id
     where p.status = 'published'
       and (${tag}::text is null or ${tag ?? ""}::text = any (p.tags))
       and (
         ${pattern}::text is null
         or p.title ilike ${pattern}
         or p.subtitle ilike ${pattern}
         or p.excerpt ilike ${pattern}
         or p.content ilike ${pattern}
         or u.display_name ilike ${pattern}
         or u.username ilike ${pattern}
         or exists (select 1 from unnest(p.tags) as t where t ilike ${pattern})
       )
     order by
       case when ${pattern}::text is not null then
         (case when p.title ilike ${pattern} then 3 else 0 end)
         + (case when p.tags::text ilike ${pattern} then 1 else 0 end)
         + (case when u.username ilike ${pattern} then 1 else 0 end)
       else 0 end desc,
       ${sql.raw(ORDER_BY[sort])}
     limit ${Math.min(Math.max(limit, 1), 50)}
     offset ${Math.max(offset, 0)}
  `);
}

/**
 * Posts by one author.
 *
 * Drafts are gated on `author_id = viewerId` in SQL itself, so a coding mistake
 * upstream can never turn a private profile page into a leak. Public profiles
 * are rendered viewer-agnostically (and cached); the owner's own view comes from
 * the dashboard.
 */
export async function getPostsByAuthor(
  username: string,
  options: { includeDrafts?: boolean; viewerId?: string | null; limit?: number; offset?: number } = {},
): Promise<PostCard[]> {
  const { includeDrafts = false, viewerId = null, limit = 20, offset = 0 } = options;
  return many<PostCard>(sql`
    select ${POST_CARD_COLUMNS}
      from posts p
      join users u on u.id = p.author_id
     where u.username = ${username}
       and (p.status = 'published'
            or (${includeDrafts}::boolean and p.author_id = ${viewerId}::uuid))
     order by coalesce(p.published_at, p.updated_at) desc
     limit ${Math.min(Math.max(limit, 1), 50)}
     offset ${Math.max(offset, 0)}
  `);
}

/** The creator dashboard table: every post the author owns, drafts included. */
export async function getAuthorPosts(authorId: string): Promise<DraftSummary[]> {
  return many<DraftSummary>(sql`
    select p.id, p.slug, p.title, p.subtitle, p.status,
           p.cover_image as "coverImage", p.cover_preset as "coverPreset",
           p.tags, p.word_count as "wordCount", p.reading_minutes as "readingMinutes",
           p.updated_at as "updatedAt", p.published_at as "publishedAt",
           p.view_count as "viewCount", p.clap_count as "clapCount",
           p.comment_count as "commentCount"
      from posts p
     where p.author_id = ${authorId}::uuid
     order by p.updated_at desc
  `);
}

/** Draft list for the editor's "my drafts" rail. */
export async function getDrafts(authorId: string, limit = 20): Promise<DraftSummary[]> {
  return many<DraftSummary>(sql`
    select p.id, p.slug, p.title, p.subtitle, p.status,
           p.cover_image as "coverImage", p.cover_preset as "coverPreset",
           p.tags, p.word_count as "wordCount", p.reading_minutes as "readingMinutes",
           p.updated_at as "updatedAt", p.published_at as "publishedAt",
           p.view_count as "viewCount", p.clap_count as "clapCount",
           p.comment_count as "commentCount"
      from posts p
     where p.author_id = ${authorId}::uuid
       and p.status = 'draft'
     order by p.updated_at desc
     limit ${limit}
  `);
}

/** Related reading for the article footer — same tags, ranked by engagement. */
export async function getRelatedPosts(postId: string, tags: string[], limit = 3): Promise<PostCard[]> {
  if (tags.length === 0) return [];
  return many<PostCard>(sql`
    select ${POST_CARD_COLUMNS}
      from posts p
      join users u on u.id = p.author_id
     where p.status = 'published'
       and p.id <> ${postId}::uuid
       and p.tags && ${sql.array(tags.slice(0, 5), "text")}
     order by (p.clap_count * 3 + p.view_count) desc, p.published_at desc
     limit ${limit}
  `);
}

/** Total published count, for the feed's pagination affordance. */
export async function countFeed(tag: string | null = null): Promise<number> {
  const row = await maybe<{ total: number }>(sql`
    select count(*)::int as total
      from posts p
     where p.status = 'published'
       and (${tag}::text is null or ${tag ?? ""}::text = any (p.tags))
  `);
  return row?.total ?? 0;
}

/** Slugs for `generateStaticParams` — keeps hot articles pre-rendered at build. */
export async function getPublishedSlugs(limit = 50): Promise<{ slug: string; updatedAt: string }[]> {
  return many(sql`
    select slug, updated_at as "updatedAt"
      from posts
     where status = 'published'
     order by coalesce(published_at, created_at) desc
     limit ${limit}
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Writes
// ─────────────────────────────────────────────────────────────────────────────

export interface UpsertPostInput {
  title: string;
  subtitle: string;
  content: string;
  excerpt: string;
  tags: string[];
  coverImage: string | null;
  coverPreset: string;
  wordCount: number;
  readingMinutes: number;
  status: "draft" | "published" | "unlisted";
}

/**
 * Autosave path. Takes the row lock for the duration of the statement and bumps
 * `updated_at`, which the editor uses to detect concurrent tabs.
 */
export async function updatePost(
  postId: string,
  authorId: string,
  input: Partial<UpsertPostInput>,
): Promise<{ id: string; slug: string; status: string; updatedAt: string } | null> {
  const { SqlBuilder } = await import("@/db/sql");
  const { getDriver } = await import("@/db/driver");

  const set = new SqlBuilder();
  const assignments: string[] = [];

  const assign = (column: string, value: SqlParam) => {
    const placeholder = set.add(value);
    assignments.push(`${column} = ${placeholder}`);
  };

  if (input.title !== undefined) assign("title", input.title);
  if (input.subtitle !== undefined) assign("subtitle", input.subtitle);
  if (input.content !== undefined) assign("content", input.content);
  if (input.excerpt !== undefined) assign("excerpt", input.excerpt);
  if (input.tags !== undefined) {
    assignments.push(`tags = ${set.addArray(input.tags, "text")}`);
  }
  if (input.coverImage !== undefined) assign("cover_image", input.coverImage);
  if (input.coverPreset !== undefined) assign("cover_preset", input.coverPreset);
  if (input.wordCount !== undefined) assign("word_count", input.wordCount);
  if (input.readingMinutes !== undefined) assign("reading_minutes", input.readingMinutes);

  // Status is a two-part transition: the enum AND the timestamp that powers the
  // feed ordering. Expressing it in one CASE means a draft can never be marked
  // published without a publish date, or un-published while keeping one.
  //
  // This MUST come before the "nothing to do" branch below. A patch carrying only
  // `status` — precisely what `unpublishPostAction` sends — used to hit that early
  // return, leaving the row untouched while the action still reported success: the
  // story stayed publicly readable after the writer un-published it.
  if (input.status !== undefined) {
    const statusParam = set.add(input.status);
    assignments.push(
      `status = ${statusParam}`,
      `published_at = case
         when ${statusParam} = 'published' and published_at is null then now()
         when ${statusParam} = 'draft' then null
         else published_at end`,
    );
  }

  // An empty patch is a read, not a write: return the row without touching
  // `updated_at`, so opening the editor cannot reorder the writer's drafts.
  if (assignments.length === 0) {
    return maybe(sql`
      select id, slug, status, updated_at as "updatedAt" from posts
       where id = ${postId}::uuid and author_id = ${authorId}::uuid
    `);
  }

  assignments.push("updated_at = now()");

  const postParam = set.add(postId);
  const authorParam = set.add(authorId);
  set.push(
    `update posts set ${assignments.join(", ")}
      where id = ${postParam}::uuid and author_id = ${authorParam}::uuid
     returning id, slug, status, updated_at as "updatedAt"`,
  );

  const result = await getDriver().query<{ id: string; slug: string; status: string; updatedAt: string }>(
    set.text,
    set.params,
  );
  return result.rows[0] ?? null;
}

/**
 * Creates a post. Slug collisions are resolved by the unique index rather than a
 * read-then-write race: we append a short suffix and retry once.
 */
/**
 * The shape the editor needs to open a story. Kept next to the queries so the
 * editor route and the query that feeds it cannot drift apart.
 */
export interface EditorPostRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  content: string;
  tags: string[];
  coverImage: string | null;
  coverPreset: string;
  status: "draft" | "published" | "unlisted";
  updatedAt: string;
  publishedAt: string | null;
}

/**
 * Opens the draft the editor should work on, without creating junk rows.
 *
 * `/write` used to call `createDraftAction()` during render, which is wrong twice
 * over: it writes to the database during a GET (so a prefetch or a crawler leaves
 * an empty draft behind) and it revalidated a path mid-render, which Next rejects
 * with "used revalidatePath during render which is unsupported".
 *
 * Now the route only *reads*. It reuses the newest untouched draft when there is
 * one and only ever inserts when the writer has none — one row per writer, not
 * one per page view.
 */
export async function getOrCreateEmptyDraft(userId: string): Promise<EditorPostRow> {
  const existing = await maybe<EditorPostRow>(sql`
    select p.id, p.slug, p.title, p.subtitle, p.content, p.tags,
           p.cover_image as "coverImage", p.cover_preset as "coverPreset",
           p.status, p.updated_at as "updatedAt", p.published_at as "publishedAt"
      from posts p
     where p.author_id = ${userId}::uuid
       and p.status = 'draft'
       and p.title = 'Untitled'
       and p.content = ''
     order by p.updated_at desc
     limit 1
  `);

  if (existing) return existing;

  const base = `untitled-${new Date().toISOString().slice(0, 10)}`;
  const created = await createPost(userId, slugify(base), { title: "Untitled", status: "draft" });

  return {
    id: created.id,
    slug: created.slug,
    title: "Untitled",
    subtitle: "",
    content: "",
    tags: [],
    coverImage: null,
    coverPreset: "linen",
    status: "draft",
    updatedAt: new Date().toISOString(),
    publishedAt: null,
  };
}

export async function createPost(
  authorId: string,
  slug: string,
  input: Partial<UpsertPostInput> & { title: string },
): Promise<{ id: string; slug: string; status: string }> {
  const { getDriver } = await import("@/db/driver");
  const { SqlBuilder } = await import("@/db/sql");
  const driver = getDriver();

  const attempt = (candidate: string) => {
    const set = new SqlBuilder();
    const author = set.add(authorId);
    const postSlug = set.add(candidate);
    const title = set.add(input.title);
    const subtitle = set.add(input.subtitle ?? "");
    const content = set.add(input.content ?? "");
    const excerpt = set.add(input.excerpt ?? "");
    const coverImage = set.add(input.coverImage ?? null);
    const coverPreset = set.add(input.coverPreset ?? "linen");
    const status = set.add(input.status ?? "draft");
    const tags = set.addArray(input.tags ?? [], "text");
    const wordCount = set.add(input.wordCount ?? 0);
    const readingMinutes = set.add(input.readingMinutes ?? 1);

    set.push(
      `insert into posts (author_id, slug, title, subtitle, content, excerpt, cover_image,
                          cover_preset, status, tags, word_count, reading_minutes, published_at)
       values (${author}::uuid, ${postSlug}, ${title}, ${subtitle}, ${content}, ${excerpt},
               ${coverImage}, ${coverPreset}, ${status}, ${tags}, ${wordCount}, ${readingMinutes},
               case when ${status} = 'published' then now() else null end)
       returning id, slug, status`,
    );

    return driver.query<{ id: string; slug: string; status: string }>(set.text, set.params);
  };

  try {
    const result = await attempt(slug);
    return result.rows[0];
  } catch (error) {
    // The unique index on slug is the source of truth — no read-then-write race.
    const code = (error as { code?: string }).code;
    if (code !== "23505") throw error;
    const result = await attempt(`${slug.slice(0, 60)}-${Math.random().toString(36).slice(2, 6)}`);
    return result.rows[0];
  }
}

/** Hard delete. Cascades remove claps, comments, bookmarks and view history. */
export async function deletePost(postId: string, authorId: string): Promise<boolean> {
  const rows = await sql`
    delete from posts
     where id = ${postId}::uuid and author_id = ${authorId}::uuid
    returning id
  `;
  return rows.length > 0;
}

/**
 * Denormalised counters are the price of a single-round-trip read path. This
 * recomputes them from the source tables and is safe to run any time (cron, CLI,
 * or after a bulk import). Claps and comments are the only counters that can
 * drift, because views are written with their own delta.
 */
export async function reconcileCounters(): Promise<number> {
  const rows = await sql`
    update posts p
       set clap_count    = coalesce(c.total, 0),
           comment_count = coalesce(m.total, 0)
      from (select post_id, sum(count)::int as total from claps group by post_id) c
      full join (select post_id, count(*)::int as total from comments group by post_id) m
        on m.post_id = c.post_id
     where p.id = coalesce(c.post_id, m.post_id)
       and (p.clap_count <> coalesce(c.total, 0) or p.comment_count <> coalesce(m.total, 0))
    returning p.id
  `;
  return rows.length;
}
