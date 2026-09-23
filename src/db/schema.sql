-- ═══════════════════════════════════════════════════════════════════════════════
--  Folio — PostgreSQL schema (Neon serverless compatible, idempotent)
--  Applied with:  npm run db:push
--
--  Conventions
--  -----------
--  • No ORM, no migrations DSL. This is the source of truth; the runner splits it
--    into single statements (respecting $$ blocks and string literals) and sends
--    them one by one, so it is safe to re-run at any time.
--  • Extensions are avoided on purpose: `gen_random_uuid()` is core since PG13 and
--    uniqueness on case-insensitive text is done with functional UNIQUE indexes.
--    A single optional pg_trgm index (fuzzy search) is wrapped in an exception
--    guard so the schema still applies on engines that ship fewer contrib modules.
--  • Counters (views/claps/comments) are denormalised on `posts` and updated in the
--    same statement as the write that causes them — one round trip, no triggers,
--    no N+1 reads on the feed. Neon's HTTP endpoint is stateless, so this keeps hot
--    paths to a single query each.
--  • Timestamps are timestamptz everywhere; the app never stores local time.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── users ──────────────────────────────────────────────────────────────────────
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text        not null,
  username      text        not null,
  display_name  text        not null,
  password_hash text        not null,
  bio           text        not null default '',
  tagline       text        not null default '',
  avatar_url    text,
  avatar_hue    smallint    not null default 20,
  role          text        not null default 'member',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint users_role_check check (role in ('member', 'admin'))
);

create unique index if not exists users_email_key    on users (lower(email));
create unique index if not exists users_username_key on users (lower(username));

-- ── sessions ───────────────────────────────────────────────────────────────────
-- The cookie carries a signed token which embeds this row id; the row itself is
-- what makes sessions revocable (logout, password change, "sign out everywhere").
create table if not exists sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null references users (id) on delete cascade,
  user_agent   text        not null default '',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at   timestamptz not null
);

create index if not exists sessions_user_idx    on sessions (user_id);
create index if not exists sessions_expires_idx on sessions (expires_at);

-- ── posts ──────────────────────────────────────────────────────────────────────
create table if not exists posts (
  id              uuid primary key default gen_random_uuid(),
  author_id       uuid        not null references users (id) on delete cascade,
  slug            text        not null,
  title           text        not null default 'Untitled',
  subtitle        text        not null default '',
  content         text        not null default '',
  -- Long-form bodies are never selected by feed queries; a plain-text excerpt is
  -- computed once at write time so feeds stay narrow and index-friendly.
  excerpt         text        not null default '',
  cover_image     text,
  cover_preset    text        not null default 'linen',
  status          text        not null default 'draft',
  tags            text[]      not null default '{}',
  word_count      integer     not null default 0,
  reading_minutes smallint    not null default 1,
  view_count      integer     not null default 0,
  clap_count      integer     not null default 0,
  comment_count   integer     not null default 0,
  featured        boolean     not null default false,
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint posts_status_check check (status in ('draft', 'published', 'unlisted'))
);

create unique index if not exists posts_slug_key     on posts (slug);
create index        if not exists posts_feed_idx     on posts (status, published_at desc);
create index        if not exists posts_trending_idx on posts (status, view_count desc, published_at desc);
create index        if not exists posts_author_idx   on posts (author_id, updated_at desc);
create index        if not exists posts_tags_idx     on posts using gin (tags);

-- Optional: fuzzy/trigram search acceleration. Skipped silently when unavailable.
do $$
begin
  create extension if not exists pg_trgm;
  create index if not exists posts_title_trgm_idx on posts using gin (title gin_trgm_ops);
exception when others then
  raise notice 'pg_trgm unavailable — falling back to ILIKE full scan for search';
end $$;

-- ── claps ──────────────────────────────────────────────────────────────────────
-- Medium-style: one row per (post, user) holding a 1..50 counter, so a reader can
-- clap repeatedly without ever writing more than one row.
create table if not exists claps (
  post_id    uuid        not null references posts (id) on delete cascade,
  user_id    uuid        not null references users (id) on delete cascade,
  count      smallint    not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id),
  constraint claps_count_check check (count between 0 and 50)
);

create index if not exists claps_user_idx on claps (user_id, updated_at desc);

-- ── bookmarks ──────────────────────────────────────────────────────────────────
create table if not exists bookmarks (
  user_id    uuid        not null references users (id) on delete cascade,
  post_id    uuid        not null references posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists bookmarks_post_idx on bookmarks (post_id);

-- ── comments ───────────────────────────────────────────────────────────────────
create table if not exists comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid        not null references posts (id) on delete cascade,
  author_id  uuid        not null references users (id) on delete cascade,
  parent_id  uuid        references comments (id) on delete cascade,
  body       text        not null,
  edited     boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comments_post_idx   on comments (post_id, created_at desc);
create index if not exists comments_parent_idx on comments (parent_id);
create index if not exists comments_author_idx on comments (author_id, created_at desc);

-- ── follows ────────────────────────────────────────────────────────────────────
create table if not exists follows (
  follower_id  uuid        not null references users (id) on delete cascade,
  following_id uuid        not null references users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

create index if not exists follows_following_idx on follows (following_id, created_at desc);

-- ── post_views ─────────────────────────────────────────────────────────────────
-- One row per reader per post. The client beacon sends heartbeats; each heartbeat
-- adds elapsed seconds, so `read_seconds` is a real "time on page" metric and
-- `updated_at > now() - 2 minutes` gives a live "reading now" gauge.
create table if not exists post_views (
  post_id      uuid        not null references posts (id) on delete cascade,
  viewer_hash  text        not null,
  user_id      uuid        references users (id) on delete set null,
  read_seconds integer     not null default 0,
  read_ratio   real        not null default 0,
  referrer     text        not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (post_id, viewer_hash)
);

create index if not exists post_views_recent_idx on post_views (post_id, updated_at desc);
create index if not exists post_views_user_idx   on post_views (user_id, updated_at desc);

-- ── reading_history ────────────────────────────────────────────────────────────
create table if not exists reading_history (
  user_id      uuid        not null references users (id) on delete cascade,
  post_id      uuid        not null references posts (id) on delete cascade,
  progress     real        not null default 0,
  last_read_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists reading_history_recent_idx on reading_history (user_id, last_read_at desc);

-- ── tag_views (cheap "what's hot" signal for the explore rail) ─────────────────
create table if not exists tag_stats (
  tag         text primary key,
  post_count  integer     not null default 0,
  clap_count  integer     not null default 0,
  last_post_at timestamptz not null default now()
);

-- ── Idempotent upgrades ───────────────────────────────────────────────────────
-- `create table if not exists` cannot add a column to a table that already
-- exists, so every column added after the first release gets an explicit
-- `add column if not exists` here. This is what makes schema.sql re-runnable
-- against a live database without a migration framework.
alter table posts add column if not exists excerpt      text not null default '';
alter table posts add column if not exists featured     boolean not null default false;
alter table posts add column if not exists cover_preset text not null default 'linen';
alter table users add column if not exists tagline      text not null default '';
alter table users add column if not exists avatar_hue   smallint not null default 20;
