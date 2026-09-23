/** lib/db/queries/users.ts — registration, lookup and profile reads. */

import { query, queryOne } from '@/lib/db';
import type { PostCard, UserRow } from './types';

export function findUserByEmail(email: string): Promise<UserRow | null> {
  return queryOne<UserRow>(`select * from users where email = $1 limit 1`, [email]);
}

export function findUserByUsername(username: string): Promise<UserRow | null> {
  return queryOne<UserRow>(`select * from users where username = $1 limit 1`, [username]);
}

export function findUserById(id: number): Promise<UserRow | null> {
  return queryOne<UserRow>(`select * from users where id = $1 limit 1`, [id]);
}

export interface NewUser {
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
}

export async function createUser(user: NewUser): Promise<UserRow> {
  const row = await queryOne<UserRow>(
    `insert into users (email, username, display_name, password_hash)
     values ($1, $2, $3, $4)
     returning *`,
    [user.email, user.username, user.displayName, user.passwordHash],
  );
  if (!row) throw new Error('db: failed to create user');
  return row;
}

export interface ProfileUpdate {
  displayName?: string;
  bio?: string | null;
  location?: string | null;
  avatarUrl?: string | null;
}

export async function updateUserProfile(id: number, patch: ProfileUpdate): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `update users
     set display_name = coalesce($2, display_name),
         bio          = coalesce($3, bio),
         location     = coalesce($4, location),
         avatar_url   = coalesce($5, avatar_url)
     where id = $1
     returning *`,
    [id, patch.displayName ?? null, patch.bio ?? null, patch.location ?? null, patch.avatarUrl ?? null],
  );
}

export interface Profile extends Omit<UserRow, 'email' | 'password_hash'> {
  published_count: number;
  total_views: number;
  total_claps: number;
  total_read_minutes: number;
}

/**
 * Public profile header: one statement for the author, their published-post
 * tally and their lifetime engagement.
 */
export function getProfileByUsername(username: string): Promise<Profile | null> {
  return queryOne<Profile>(
    `select u.id, u.username, u.display_name, u.avatar_url, u.bio, u.location, u.created_at,
            count(p.id) as published_count,
            sum(p.view_count) as total_views,
            sum(p.clap_count) as total_claps,
            sum(p.read_minutes) as total_read_minutes
     from users u
     left join posts p on p.author_id = u.id and p.status = $2
     where u.username = $1
     group by u.id
     limit 1`,
    [username, 'published'],
  );
}

export function getSavedPosts(userId: number, limit = 50, offset = 0): Promise<PostCard[]> {
  return query<PostCard>(
    `select p.id, p.slug, p.title, p.subtitle, p.excerpt, p.cover_url,
            p.word_count, p.read_minutes, p.view_count, p.clap_count, p.comment_count,
            p.published_at, p.created_at, p.status,
            u.id as author_id, u.username, u.display_name, u.avatar_url,
            array_agg(tg.name) filter (where tg.name is not null) as tags,
            case when exists (
              select 1 from claps cl where cl.post_id = p.id and cl.user_id = $1
            ) then true else false end as clapped,
            true as bookmarked
     from bookmarks b
     join posts p on p.id = b.post_id
     join users u on u.id = p.author_id
     left join post_tags pt on pt.post_id = p.id
     left join tags tg on tg.id = pt.tag_id
     where b.user_id = $1
     group by p.id, u.id, b.created_at
     order by b.created_at desc, p.id desc
     limit $2 offset $3`,
    [userId, limit, offset],
  );
}

export function listUsers(limit = 12): Promise<Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar_url' | 'bio'>[]> {
  return query(
    `select id, username, display_name, avatar_url, bio from users order by created_at asc limit $1`,
    [limit],
  );
}

/** People rail on the search page. The trgm index on `username` serves this. */
export function searchUsers(
  term: string,
  limit = 5,
): Promise<Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar_url' | 'bio'>[]> {
  const like = `%${term}%`;
  return query(
    `select id, username, display_name, avatar_url, bio
     from users
     where username ilike $1 or display_name ilike $1
     order by username asc
     limit $2`,
    [like, limit],
  );
}
