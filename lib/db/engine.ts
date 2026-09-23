/**
 * lib/db/engine.ts — the memory-mode schema registry and singleton.
 *
 * This mirrors `db/schema.sql` for the in-memory engine only. Neon is the
 * source of truth in production; this file exists so the app can boot, be
 * demoed and be tested without a database.
 */

import { MemoryDb, toTsvector, type ColumnDef, type TableDef } from './memory';

const c = (name: string, type: ColumnDef['type'], extra: Partial<ColumnDef> = {}): ColumnDef => ({
  name,
  type,
  ...extra,
});

const searchVector = (row: Record<string, unknown>): string =>
  [
    toTsvector(String(row.title ?? '')),
    toTsvector(String(row.subtitle ?? '')),
    toTsvector(String(row.excerpt ?? '')),
  ]
    .join(' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');

const defs: TableDef[] = [
  {
    name: 'users',
    columns: [
      c('id', 'bigint', { identity: true }),
      c('email', 'text'),
      c('username', 'text'),
      c('display_name', 'text'),
      c('password_hash', 'text'),
      c('avatar_url', 'text', { defaultNull: true }),
      c('bio', 'text', { defaultNull: true }),
      c('location', 'text', { defaultNull: true }),
      c('created_at', 'timestamptz', { defaultNow: true }),
    ],
    unique: [['email'], ['username']],
  },
  {
    name: 'sessions',
    columns: [
      c('id', 'bigint', { identity: true }),
      c('user_id', 'bigint'),
      c('token_hash', 'text'),
      c('expires_at', 'timestamptz'),
      c('created_at', 'timestamptz', { defaultNow: true }),
      c('user_agent', 'text', { defaultNull: true }),
      c('ip_hash', 'text', { defaultNull: true }),
    ],
    unique: [['token_hash']],
  },
  {
    name: 'posts',
    columns: [
      c('id', 'bigint', { identity: true }),
      c('author_id', 'bigint'),
      c('slug', 'text'),
      c('title', 'text'),
      c('subtitle', 'text', { defaultNull: true }),
      c('cover_url', 'text', { defaultNull: true }),
      c('content', 'text', { defaultValue: '' }),
      c('content_html', 'text', { defaultValue: '' }),
      c('excerpt', 'text', { defaultNull: true }),
      c('status', 'text', { defaultValue: 'draft' }),
      c('word_count', 'int', { default0: true }),
      c('read_minutes', 'int', { default0: true }),
      c('view_count', 'int', { default0: true }),
      c('clap_count', 'int', { default0: true }),
      c('comment_count', 'int', { default0: true }),
      c('search', 'tsvector', { generated: searchVector }),
      c('published_at', 'timestamptz', { defaultNull: true }),
      c('created_at', 'timestamptz', { defaultNow: true }),
      c('updated_at', 'timestamptz', { defaultNow: true }),
    ],
    unique: [['slug']],
  },
  {
    name: 'tags',
    columns: [c('id', 'bigint', { identity: true }), c('slug', 'text'), c('name', 'text')],
    unique: [['slug']],
  },
  {
    name: 'post_tags',
    columns: [c('post_id', 'bigint'), c('tag_id', 'bigint')],
    unique: [['post_id', 'tag_id']],
  },
  {
    name: 'claps',
    columns: [
      c('post_id', 'bigint'),
      c('user_id', 'bigint'),
      c('count', 'int', { default0: true }),
      c('created_at', 'timestamptz', { defaultNow: true }),
    ],
    unique: [['post_id', 'user_id']],
  },
  {
    name: 'comments',
    columns: [
      c('id', 'bigint', { identity: true }),
      c('post_id', 'bigint'),
      c('user_id', 'bigint'),
      c('parent_id', 'bigint', { defaultNull: true }),
      c('body', 'text'),
      c('created_at', 'timestamptz', { defaultNow: true }),
    ],
    unique: [['id']],
  },
  {
    name: 'bookmarks',
    columns: [c('post_id', 'bigint'), c('user_id', 'bigint'), c('created_at', 'timestamptz', { defaultNow: true })],
    unique: [['post_id', 'user_id']],
  },
  {
    name: 'post_views',
    columns: [
      c('id', 'bigint', { identity: true }),
      c('post_id', 'bigint'),
      c('viewer_key', 'text'),
      c('created_at', 'timestamptz', { defaultNow: true }),
      // Mirrors the `unique (post_id, viewer_key, (created_at::date))` index in
      // db/schema.sql: one analytics row per reader per post per day.
      c('day', 'text'),
    ],
    unique: [['post_id', 'viewer_key', 'day']],
  },
];

export const schema: Record<string, TableDef> = Object.fromEntries(defs.map((d) => [d.name, d]));

/**
 * One engine per server instance. Serverless functions are short-lived, so
 * this is effectively "per warm container" — which is exactly what a demo
 * database should be.
 */
export const memoryDb = new MemoryDb(schema);

export function isMemoryDbSeeded(): boolean {
  return memoryDb.tables.users.length > 0;
}
