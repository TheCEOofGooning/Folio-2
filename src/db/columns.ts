/**
 * Shared SQL projections.
 *
 * Feed cards, bookmarks, search results and the author dashboard all render the
 * same post shape, so the projection lives in one place. `json_build_object`
 * produces the nested author object in the same round trip — no second query, no
 * join-and-stitch in application code.
 *
 * Rule of thumb encoded here: **never `select *`, and never `select content`** on
 * the read path. A feed of 12 posts would otherwise drag ~40 KB of Markdown
 * through the network and the React tree for cards that show 200 characters.
 */
import { sql } from "./sql";

/** Post columns for every card-shaped surface. */
export const POST_CARD_COLUMNS = sql.raw(`
  p.id,
  p.slug,
  p.title,
  p.subtitle,
  p.excerpt,
  p.cover_image   as "coverImage",
  p.cover_preset  as "coverPreset",
  p.tags,
  p.status,
  p.featured,
  p.word_count      as "wordCount",
  p.reading_minutes as "readingMinutes",
  p.clap_count      as "clapCount",
  p.comment_count   as "commentCount",
  p.view_count      as "viewCount",
  p.published_at    as "publishedAt",
  p.created_at      as "createdAt",
  p.updated_at      as "updatedAt",
  json_build_object(
    'id',          u.id,
    'username',    u.username,
    'displayName', u.display_name,
    'avatarUrl',   u.avatar_url,
    'avatarHue',   u.avatar_hue,
    'bio',         u.bio,
    'tagline',     u.tagline
  ) as author
`);

/** Just the author object, for comment/profile joins. */
export const AUTHOR_COLUMNS = sql.raw(`
  json_build_object(
    'id',          u.id,
    'username',    u.username,
    'displayName', u.display_name,
    'avatarUrl',   u.avatar_url,
    'avatarHue',   u.avatar_hue,
    'bio',         u.bio,
    'tagline',     u.tagline
  ) as author
`);

/**
 * Hacker-News-style time decay, expressed in SQL so "trending" is a single
 * indexed-ish sort instead of an application-side scoring pass:
 *
 *     score = (4·claps + 2·comments + views) / 2^(age_in_weeks)
 *
 * A week-old post needs twice the engagement to outrank a fresh one; a month-old
 * post needs sixteen times. It degrades gracefully on a cold database (all posts
 * tie at their raw engagement) and never returns an empty rail.
 */
export const TRENDING_SCORE = sql.raw(`
  (p.clap_count * 4 + p.comment_count * 2 + p.view_count)::float8
  / power(2.0, greatest(0, extract(epoch from (now() - coalesce(p.published_at, p.created_at))) / 604800.0))
`);
