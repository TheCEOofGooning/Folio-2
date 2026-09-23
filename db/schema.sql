-- ============================================================================
--  Folio — Postgres schema (Neon)
--  Apply with:  npm run db:push     (or paste into the Neon SQL editor)
--
--  Design notes
--  ------------
--  * No ORM. Every access path is a hand-written statement in lib/db/queries,
--    so each screen maps to exactly one round-trip against Neon.
--  * Wide, denormalised read models: `posts` carries its own counters and a
--    generated tsvector, so the feed never fans out into extra queries.
--  * `updated_at` is maintained by a trigger. The denormalised clap/comment
--    counters are maintained by the query layer inside the same transaction
--    (lib/db/queries/engage.ts) so behaviour is identical on Neon and in the
--    in-memory engine used for local development.
--  * Emails are normalised to lowercase in the app layer (one source of
--    truth) so we avoid the citext extension dependency.
-- ============================================================================

-- Used for fuzzy username search (ILIKE '%x%' can use a trgm index).
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- users -----
create table if not exists users (
  id            bigint generated always as identity primary key,
  email         text        not null unique,
  username      text        not null unique,
  display_name  text        not null,
  password_hash text        not null,
  avatar_url    text,
  bio           text,
  location      text,
  created_at    timestamptz not null default now()
);

create index if not exists users_username_trgm_idx on users using gin (username gin_trgm_ops);

-- ------------------------------------------------------------- sessions -----
-- Only the SHA-256 of the session token is stored; a database leak can never
-- be replayed as a valid cookie.
create table if not exists sessions (
  id           bigint generated always as identity primary key,
  user_id      bigint      not null references users (id) on delete cascade,
  token_hash   text        not null unique,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  user_agent   text,
  ip_hash      text
);

create index if not exists sessions_user_idx on sessions (user_id);
create index if not exists sessions_expiry_idx on sessions (expires_at);

-- ---------------------------------------------------------------- posts -----
create table if not exists posts (
  id            bigint generated always as identity primary key,
  author_id     bigint      not null references users (id) on delete cascade,
  slug          text        not null unique,
  title         text        not null,
  subtitle      text,
  cover_url     text,
  content       text        not null default '',
  content_html  text        not null default '',
  excerpt       text,
  status        text        not null default 'draft' check (status in ('draft', 'published')),
  word_count    integer     not null default 0,
  read_minutes  integer     not null default 1,
  view_count    integer     not null default 0,
  clap_count    integer     not null default 0,
  comment_count integer     not null default 0,
  search        tsvector    generated always as (
                  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                  setweight(to_tsvector('simple', coalesce(subtitle, '')), 'B') ||
                  setweight(to_tsvector('simple', coalesce(excerpt, '')), 'C')
                ) stored,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists posts_feed_idx      on posts (status, published_at desc);
create index if not exists posts_author_idx    on posts (author_id, published_at desc);
create index if not exists posts_search_idx    on posts using gin (search);
create index if not exists posts_hot_idx       on posts (status, view_count desc);

-- ----------------------------------------------------------------- tags -----
-- Tag usage counts are derived with a grouped join (see lib/db/queries/posts.ts)
-- rather than denormalised, so they can never drift out of sync.
create table if not exists tags (
  id   bigint generated always as identity primary key,
  slug text not null unique,
  name text not null
);

create table if not exists post_tags (
  post_id bigint not null references posts (id) on delete cascade,
  tag_id  bigint not null references tags (id) on delete cascade,
  primary key (post_id, tag_id)
);

create index if not exists post_tags_tag_idx on post_tags (tag_id);

-- ---------------------------------------------------------------- claps -----
create table if not exists claps (
  post_id    bigint      not null references posts (id) on delete cascade,
  user_id    bigint      not null references users (id) on delete cascade,
  count      integer     not null default 1,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- ------------------------------------------------------------- comments -----
create table if not exists comments (
  id         bigint      generated always as identity primary key,
  post_id    bigint      not null references posts (id) on delete cascade,
  user_id    bigint      not null references users (id) on delete cascade,
  parent_id  bigint      references comments (id) on delete cascade,
  body       text        not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_post_idx on comments (post_id, created_at);

-- ------------------------------------------------------------ bookmarks -----
create table if not exists bookmarks (
  post_id    bigint      not null references posts (id) on delete cascade,
  user_id    bigint      not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- --------------------------------------------------------- post_views -----
-- Append-only analytics event log. One row per reader per post per day, so
-- "views" and "unique readers" are both derivable and the table stays small.
create table if not exists post_views (
  id         bigint      generated always as identity primary key,
  post_id    bigint      not null references posts (id) on delete cascade,
  viewer_key text        not null,           -- sha256(ip + user-agent + salt)
  day        date        not null default now(),
  created_at timestamptz not null default now(),
  -- One analytics row per reader per post per UTC day. The constraint is also
  -- what makes `insert ... on conflict do nothing` a reliable "new view?" test.
  unique (post_id, viewer_key, day)
);

create index if not exists post_views_post_day_idx on post_views (post_id, created_at);

-- ============================================================== triggers ====

-- Only `updated_at` is trigger-maintained: it is pure bookkeeping and can
-- never conflict with application logic. The denormalised clap/comment
-- counters are updated by the query layer inside the same transaction
-- (see lib/db/queries/engage.ts) so Neon and the in-memory development
-- engine behave identically.
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists posts_touch on posts;
create trigger posts_touch before update on posts
for each row execute function set_updated_at();
