/** Row shapes returned by the statements in this folder. Hand-written on purpose. */

export type PostStatus = 'draft' | 'published';

export interface UserRow {
  id: number;
  email: string;
  username: string;
  display_name: string;
  password_hash: string;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  created_at: Date;
}

/** Everything safe to render publicly. */
export interface Author {
  author_id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface PostCard extends Author {
  id: number;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  cover_url: string | null;
  word_count: number;
  read_minutes: number;
  view_count: number;
  clap_count: number;
  comment_count: number;
  published_at: Date | null;
  created_at: Date;
  tags: string[] | null;
  clapped: boolean;
  bookmarked: boolean;
}

export interface PostRow extends PostCard {
  status: PostStatus;
  content: string;
  content_html: string;
  updated_at: Date;
}

export interface CommentRow {
  id: number;
  post_id: number;
  user_id: number;
  parent_id: number | null;
  body: string;
  created_at: Date;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface TagRow {
  slug: string;
  name: string;
  post_count: number;
}

export interface CreatorPostRow {
  id: number;
  slug: string;
  title: string;
  status: PostStatus;
  cover_url: string | null;
  view_count: number;
  clap_count: number;
  comment_count: number;
  read_minutes: number;
  word_count: number;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ViewBucket {
  day: string;
  views: number;
}

export interface AuthorStats {
  total_views: number;
  total_claps: number;
  total_comments: number;
  total_read_minutes: number;
  /** Distinct readers across every post (not page views). */
  total_readers: number;
  published: number;
  drafts: number;
}
