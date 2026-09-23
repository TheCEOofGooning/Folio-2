/**
 * lib/db/queries/posts.ts — every statement that reads or writes `posts`.
 *
 * One SELECT shape serves the feed, tag pages, search, author pages, the
 * creator dashboard and related-posts rails; only the WHERE/ORDER/LIMIT
 * fragments change, and every one of those fragments is a constant in this
 * file. User input only ever enters through `$n` parameters.
 */

import { query, queryOne, transaction, type Param } from '@/lib/db';
import type { CreatorPostRow, PostCard, PostRow, TagRow } from './types';

export type PostSort = 'latest' | 'trending' | 'discussed' | 'updated';

export interface PostFilter {
  /** Signed-in reader, used for the clapped/bookmarked flags. */
  userId?: number | null;
  status?: 'draft' | 'published';
  authorId?: number;
  tag?: string;
  search?: string;
  sort?: PostSort;
  limit?: number;
  offset?: number;
  /** Restrict to posts published inside this window (trending candidates). */
  withinDays?: number;
}

/** Assigns `$1, $2, …` in the order fragments are concatenated. */
class Sql {
  readonly params: Param[] = [];
  add(value: Param): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }
}

const SELECT_LIST = `
  p.id, p.slug, p.title, p.subtitle, p.excerpt, p.cover_url,
  p.word_count, p.read_minutes, p.view_count, p.clap_count, p.comment_count,
  p.published_at, p.created_at, p.status,
  u.id as author_id, u.username, u.display_name, u.avatar_url,
  array_agg(tg.name) filter (where tg.name is not null) as tags,
  case when exists (
    select 1 from claps cl where cl.post_id = p.id and cl.user_id = $1
  ) then true else false end as clapped,
  case when exists (
    select 1 from bookmarks bm where bm.post_id = p.id and bm.user_id = $1
  ) then true else false end as bookmarked`;

const FROM_LIST = `
from posts p
join users u on u.id = p.author_id
left join post_tags pt on pt.post_id = p.id
left join tags tg on tg.id = pt.tag_id`;

const ORDER_BY: Record<PostSort, string> = {
  latest: 'p.published_at desc, p.id desc',
  trending: 'p.view_count desc, p.id desc',
  discussed: 'p.comment_count desc, p.clap_count desc, p.id desc',
  updated: 'p.updated_at desc, p.id desc',
};

function buildPostSelect(filter: PostFilter): { text: string; params: Param[] } {
  const sql = new Sql();
  // $1 is reserved for the reader id referenced by the SELECT list.
  sql.add(filter.userId ?? null);

  const where: string[] = [];
  if (filter.status) where.push(`p.status = ${sql.add(filter.status)}`);
  if (filter.authorId) where.push(`p.author_id = ${sql.add(filter.authorId)}`);
  if (filter.tag) {
    where.push(
      `exists (select 1 from post_tags pt2 join tags tg2 on tg2.id = pt2.tag_id
               where pt2.post_id = p.id and tg2.slug = ${sql.add(filter.tag)})`,
    );
  }
  if (filter.search) {
    const term = sql.add(`%${filter.search}%`);
    where.push(`(p.title ilike ${term} or p.subtitle ilike ${term} or u.username ilike ${term})`);
  }
  if (filter.withinDays) where.push(`p.published_at >= now() - interval '${Math.floor(filter.withinDays)} days'`);

  const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
  const offset = Math.max(filter.offset ?? 0, 0);

  const text = `select ${SELECT_LIST} ${FROM_LIST}
${where.length ? `where ${where.join('\n  and ')}` : ''}
group by p.id, u.id
order by ${ORDER_BY[filter.sort ?? 'latest']}
limit ${sql.add(limit)} offset ${sql.add(offset)}`;

  return { text, params: sql.params };
}

/** Raw candidate rows. Use `listPosts()` unless you need to re-rank yourself. */
export async function selectPosts(filter: PostFilter): Promise<PostCard[]> {
  const { text, params } = buildPostSelect(filter);
  return query<PostCard>(text, params);
}

/**
 * Hacker-News style decay ranking.
 *
 * Postgres could do this with `exp()` and `extract(epoch …)`, but keeping the
 * formula in TypeScript means it is unit-testable, portable and trivially
 * tunable without a migration.
 */
export function trendingScore(post: Pick<PostCard, 'view_count' | 'clap_count' | 'comment_count' | 'published_at'>, now = Date.now()): number {
  const publishedAt = post.published_at ? new Date(post.published_at).getTime() : now;
  const ageHours = Math.max((now - publishedAt) / 3_600_000, 0);
  const points = post.view_count * 1 + post.clap_count * 4 + post.comment_count * 6;
  return points / Math.pow(ageHours + 2, 1.4);
}

export async function listPosts(filter: PostFilter): Promise<PostCard[]> {
  const sort = filter.sort ?? 'latest';
  if (sort !== 'trending') return selectPosts(filter);

  // Pull a bounded candidate window, then rank in-process. One round-trip,
  // no window functions, and the decay formula stays in TypeScript.
  const candidates = await selectPosts({ ...filter, sort: 'latest', withinDays: 30, limit: 100 });
  return candidates
    .map((post) => ({ post, score: trendingScore(post) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, filter.limit ?? 20)
    .map((entry) => entry.post);
}

/**
 * Full-text search.
 *
 * `search` is a generated, weighted tsvector maintained by Postgres itself, so
 * titles outrank subtitles which outrank body text — and the GIN index in
 * db/schema.sql does the work. The ILIKE branches catch substring matches that
 * lexing misses (usernames, hyphenated slugs).
 */
export function searchPosts(term: string, userId?: number | null, limit = 20): Promise<PostCard[]> {
  const sql = new Sql();
  sql.add(userId ?? null); // $1 — referenced by the SELECT list
  const tsQuery = sql.add(term);
  const like = sql.add(`%${term}%`);

  const text = `select ${SELECT_LIST} ${FROM_LIST}
where p.status = ${sql.add('published')}
  and (
    p.search @@ websearch_to_tsquery('simple', ${tsQuery})
    or p.title ilike ${like}
    or p.subtitle ilike ${like}
    or u.username ilike ${like}
  )
group by p.id, u.id
order by ts_rank(p.search, websearch_to_tsquery('simple', ${tsQuery})) desc, p.published_at desc
limit ${sql.add(limit)}`;

  return query<PostCard>(text, sql.params);
}

export function listPostsByTag(tag: string, userId?: number | null, limit = 20, offset = 0): Promise<PostCard[]> {
  return selectPosts({ status: 'published', tag, userId, limit, offset, sort: 'latest' });
}

export function listPostsByAuthor(authorId: number, userId?: number | null, limit = 20, offset = 0): Promise<PostCard[]> {
  return selectPosts({ status: 'published', authorId, userId, limit, offset, sort: 'latest' });
}

const DETAIL_SELECT = `select ${SELECT_LIST}, p.content, p.content_html, p.updated_at ${FROM_LIST}`;

export async function getPublishedPostBySlug(slug: string, userId?: number | null): Promise<PostRow | null> {
  const sql = new Sql();
  sql.add(userId ?? null); // $1, referenced by the clapped/bookmarked flags
  const text = `${DETAIL_SELECT}
where p.slug = ${sql.add(slug)} and p.status = ${sql.add('published')}
group by p.id, u.id
limit ${sql.add(1)}`;
  return queryOne<PostRow>(text, sql.params);
}

export async function getOwnPostBySlug(slug: string, authorId: number): Promise<PostRow | null> {
  const sql = new Sql();
  sql.add(authorId); // $1 — the author is their own reader here
  const text = `${DETAIL_SELECT}
where p.slug = ${sql.add(slug)} and p.author_id = ${sql.add(authorId)}
group by p.id, u.id
limit ${sql.add(1)}`;
  return queryOne<PostRow>(text, sql.params);
}

export async function getPostById(id: number): Promise<PostRow | null> {
  const sql = new Sql();
  sql.add(null);
  const text = `${DETAIL_SELECT}
where p.id = ${sql.add(id)}
group by p.id, u.id
limit ${sql.add(1)}`;
  return queryOne<PostRow>(text, sql.params);
}

export function getRelatedPosts(postId: number, authorId: number, limit = 3): Promise<PostCard[]> {
  const sql = new Sql();
  sql.add(null);
  const text = `select ${SELECT_LIST} ${FROM_LIST}
where p.status = ${sql.add('published')} and p.id <> ${sql.add(postId)} and p.author_id = ${sql.add(authorId)}
group by p.id, u.id
order by p.published_at desc
limit ${sql.add(limit)}`;
  return query<PostCard>(text, sql.params);
}

export async function listCreatorPosts(authorId: number): Promise<CreatorPostRow[]> {
  return query<CreatorPostRow>(
    `select id, slug, title, status, cover_url, view_count, clap_count, comment_count,
            read_minutes, word_count, published_at, created_at, updated_at
     from posts
     where author_id = $1
     order by status asc, updated_at desc
     limit 200`,
    [authorId],
  );
}

/* ------------------------------------------------------------- mutations */

export interface DraftInput {
  authorId: number;
  title: string;
  subtitle?: string | null;
  content: string;
  contentHtml: string;
  excerpt?: string | null;
  coverUrl?: string | null;
  tags: string[];
  slug: string;
  wordCount: number;
  readMinutes: number;
}

export async function createDraft(input: DraftInput): Promise<{ id: number; slug: string }> {
  const created = await queryOne<{ id: number; slug: string }>(
    `insert into posts (author_id, slug, title, subtitle, content, content_html, excerpt,
                        cover_url, status, word_count, read_minutes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning id, slug`,
    [
      input.authorId,
      input.slug,
      input.title,
      input.subtitle ?? null,
      input.content,
      input.contentHtml,
      input.excerpt ?? null,
      input.coverUrl ?? null,
      'draft',
      input.wordCount,
      input.readMinutes,
    ],
  );
  if (!created) throw new Error('db: failed to create draft');
  await setTags(created.id, input.tags);
  return created;
}

export interface UpdateInput {
  id: number;
  title: string;
  subtitle?: string | null;
  content: string;
  contentHtml: string;
  excerpt?: string | null;
  coverUrl?: string | null;
  tags: string[];
  wordCount: number;
  readMinutes: number;
}

export async function updatePost(input: UpdateInput): Promise<void> {
  await query(
    `update posts set title = $2, subtitle = $3, content = $4, content_html = $5,
                      excerpt = $6, cover_url = $7, word_count = $8, read_minutes = $9
     where id = $1`,
    [
      input.id,
      input.title,
      input.subtitle ?? null,
      input.content,
      input.contentHtml,
      input.excerpt ?? null,
      input.coverUrl ?? null,
      input.wordCount,
      input.readMinutes,
    ],
  );
  await setTags(input.id, input.tags);
}

export async function publishPost(id: number): Promise<void> {
  await query(
    `update posts
     set status = $2, published_at = coalesce(published_at, now())
     where id = $1`,
    [id, 'published'],
  );
}

export async function unpublishPost(id: number): Promise<void> {
  await query(`update posts set status = $2 where id = $1`, [id, 'draft']);
}

export async function deletePost(id: number): Promise<void> {
  await query(`delete from posts where id = $1`, [id]);
}

/**
 * Replaces a post's tags. Tag rows are shared and reference-counted by a
 * trigger, so this is an upsert + delete, never a tag delete.
 */
export async function setTags(postId: number, tags: string[]): Promise<void> {
  const clean = Array.from(
    new Set(
      tags
        .map((t) => t.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''))
        .filter((t) => t.length > 0),
    ),
  ).slice(0, 5);

  const statements = [{ text: `delete from post_tags where post_id = $1`, params: [postId] as Param[] }];
  for (const slug of clean) {
    statements.push({
      text: `insert into tags (slug, name) values ($1, $2) on conflict (slug) do nothing`,
      params: [slug, slug.replace(/-/g, ' ')],
    });
    statements.push({
      text: `insert into post_tags (post_id, tag_id)
             select $1, id from tags where slug = $2
             on conflict (post_id, tag_id) do nothing`,
      params: [postId, slug],
    });
  }
  await transaction(statements);
}

export function listPopularTags(limit = 12): Promise<TagRow[]> {
  return query<TagRow>(
    `select t.slug, t.name, count(pt.post_id) as post_count
     from tags t
     join post_tags pt on pt.tag_id = t.id
     group by t.id, t.slug, t.name
     order by post_count desc, t.name asc
     limit $1`,
    [limit],
  );
}
