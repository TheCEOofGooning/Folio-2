/**
 * Cached read wrappers.
 *
 * ── Why this layer exists ─────────────────────────────────────────────────────
 * Folio mixes two caching strategies, and they solve different problems:
 *
 *  1. **Route-level ISR** (`export const revalidate = 60`) caches the rendered
 *     HTML on Vercel's CDN. A hit costs zero function invocations and zero
 *     database round trips — the ideal case, used for slugs we can enumerate.
 *
 *  2. **Data-level cache** (this file, via `unstable_cache`) caches the *query
 *     result* in Next's data cache. It exists because pages that read
 *     `searchParams` (a filtered feed, a search) cannot be statically rendered —
 *     but the underlying query usually can be cached, since "trending stories by
 *     tag" is the same answer for everybody for the next minute.
 *
 * Between them, a hot page does one of: serve static HTML, or serve a cached
 * query. Only cache misses reach Neon, which is what keeps the pooled connection
 * count flat as traffic grows.
 *
 * Every entry is tagged, and `revalidatePostSurfaces()` in the post actions
 * invalidates `posts` — so publishing is visible immediately rather than after a
 * TTL expires.
 */
import { unstable_cache } from "next/cache";
import {
  countFeed,
  getFeed,
  getFeaturedPosts,
  getPostBySlug,
  getPublishedSlugs,
  getRelatedPosts,
  type FeedOptions,
} from "./queries/posts";
import { getTopTags, getActiveAuthors } from "./queries/tags";
import { getNotableAuthors, getProfile } from "./queries/users";

/** Cache tags Folio invalidates. Keep them in one place so nothing is orphaned. */
export const CACHE_TAGS = {
  posts: "posts",
  tags: "tags",
  authors: "authors",
} as const;

const MINUTE = 60;
const FIVE_MINUTES = 300;

export const getCachedFeed = unstable_cache(
  async (options: FeedOptions) => getFeed(options),
  ["feed"],
  { revalidate: MINUTE, tags: [CACHE_TAGS.posts, CACHE_TAGS.authors] },
);

/**
 * Article shell, cached per slug and viewer-agnostic (`viewerId = null`).
 *
 * This is what lets an article page be static while still being personal: the
 * cached HTML is the same for everyone, and the reader's own clap/bookmark state
 * arrives in a small island afterwards. Tagged per-slug so republishing one story
 * invalidates exactly that story.
 */
export const getCachedPost = unstable_cache(
  async (slug: string) => getPostBySlug(slug, null),
  ["post"],
  { revalidate: MINUTE, tags: [CACHE_TAGS.posts] },
);

export const getCachedFeatured = unstable_cache(
  async (limit: number) => getFeaturedPosts(limit),
  ["featured"],
  { revalidate: FIVE_MINUTES, tags: [CACHE_TAGS.posts] },
);

export const getCachedRelated = unstable_cache(
  async (postId: string, tags: string[], limit: number) => getRelatedPosts(postId, tags, limit),
  ["related"],
  { revalidate: FIVE_MINUTES, tags: [CACHE_TAGS.posts] },
);

export const getCachedTopTags = unstable_cache(
  async (limit: number) => getTopTags(limit),
  ["top-tags"],
  { revalidate: FIVE_MINUTES, tags: [CACHE_TAGS.tags, CACHE_TAGS.posts] },
);

export const getCachedActiveAuthors = unstable_cache(
  async (limit: number) => getActiveAuthors(limit),
  ["active-authors"],
  { revalidate: FIVE_MINUTES, tags: [CACHE_TAGS.authors] },
);

export const getCachedNotableAuthors = unstable_cache(
  async (limit: number) => getNotableAuthors(limit),
  ["notable-authors"],
  { revalidate: FIVE_MINUTES, tags: [CACHE_TAGS.authors, CACHE_TAGS.posts] },
);

export const getCachedProfile = unstable_cache(
  async (username: string) => getProfile(username, null),
  ["profile"],
  { revalidate: FIVE_MINUTES, tags: [CACHE_TAGS.authors] },
);

export const getCachedSlugs = unstable_cache(
  async (limit: number) => getPublishedSlugs(limit),
  ["slugs"],
  { revalidate: FIVE_MINUTES, tags: [CACHE_TAGS.posts] },
);

export const getCachedFeedCount = unstable_cache(
  async (tag: string | null) => countFeed(tag),
  ["feed-count"],
  { revalidate: FIVE_MINUTES, tags: [CACHE_TAGS.posts] },
);
