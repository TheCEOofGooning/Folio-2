/**
 * Row-level types for every Folio query.
 *
 * These mirror the SQL projections one-for-one (column aliases included) because
 * there is no ORM generating them. Keeping them in a single file makes the
 * contract between `src/db/queries/*` and the UI obvious: if a type changes here,
 * TypeScript points at every component that renders it.
 */

export interface AuthorSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarHue: number;
  bio: string;
  tagline: string;
}

/** Card-sized projection used by feeds, grids, search results and bookmarks. */
export interface PostCard {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  excerpt: string;
  coverImage: string | null;
  coverPreset: string;
  tags: string[];
  readingMinutes: number;
  wordCount: number;
  clapCount: number;
  commentCount: number;
  viewCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  status: PostStatus;
  featured: boolean;
  author: AuthorSummary;
}

/** Full article projection. */
export interface PostDetail extends PostCard {
  content: string;
  authorFollowers: number;
  authorPosts: number;
  /** Viewer-relative state, resolved in the same query. */
  viewerClaps: number;
  viewerBookmarked: boolean;
  viewerFollowingAuthor: boolean;
}

export type PostStatus = "draft" | "published" | "unlisted";

export interface CommentNode {
  id: string;
  body: string;
  parentId: string | null;
  edited: boolean;
  createdAt: string;
  updatedAt: string;
  author: AuthorSummary;
}

export interface CommentWithReplies extends CommentNode {
  replies: CommentNode[];
}

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarHue: number;
}

export interface ProfileRow {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  tagline: string;
  avatarUrl: string | null;
  avatarHue: number;
  createdAt: string;
  postCount: number;
  followerCount: number;
  followingCount: number;
  totalClaps: number;
  totalReads: number;
  viewerFollowing: boolean;
}

export interface DashboardStats {
  publishedCount: number;
  draftCount: number;
  totalViews: number;
  totalReads: number;
  totalClaps: number;
  totalComments: number;
  followers: number;
  avgReadSeconds: number;
}

/** One row of the creator analytics table. */
export interface AnalyticsRow {
  postId: string;
  title: string;
  slug: string;
  status: PostStatus;
  publishedAt: string | null;
  views: number;
  readers: number;
  claps: number;
  comments: number;
  /** Mean seconds on page, from the reader heartbeat. */
  avgReadSeconds: number;
  /** Mean scroll depth, 0–1. */
  avgReadRatio: number;
  /** Share of readers who reached the end of the article, 0–1. */
  completionRate: number;
  /** Heartbeats from the last two minutes — the live "reading now" gauge. */
  readingNow: number;
}

export interface TagStat {
  tag: string;
  postCount: number;
  clapCount: number;
}

export interface DraftSummary {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  status: PostStatus;
  coverImage: string | null;
  coverPreset: string;
  tags: string[];
  wordCount: number;
  readingMinutes: number;
  updatedAt: string;
  publishedAt: string | null;
  viewCount: number;
  clapCount: number;
  commentCount: number;
}
