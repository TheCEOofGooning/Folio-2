/**
 * `npm run db:seed`
 *
 * Loads demo authors, essays, comments, claps, follows, bookmarks and reader
 * analytics so a fresh Folio install has something real to look at. Idempotent:
 * re-running replaces the demo posts (cascade clears their social rows) and
 * upserts the demo accounts, so your own content is never touched.
 *
 *   npm run db:seed              # demo content
 *   npm run db:seed -- --quiet   # same, less chatter
 */
import { loadEnv, query } from "./neon-http.mjs";
import { AUTHORS, COMMENTS, DEMO_PASSWORD, DRAFTS, POSTS } from "./seed-content.mjs";

loadEnv();

const quiet = process.argv.includes("--quiet");
const log = (...args) => (quiet ? undefined : console.log(...args));

// ── Password hashing (mirrors src/lib/auth/password.ts) ───────────────────────
const ITERATIONS = 210_000;

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$sha256$${ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
/** Deterministic PRNG so repeat seeds produce identical analytics. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wordCount(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~\-|]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

const readingMinutes = (words) => Math.max(1, Math.round(words / 225));

/**
 * Plain-text excerpt — the same projection `markdownToPlainText` produces in the
 * app, computed once at write time so feed queries never select `content`.
 */
function excerptOf(markdown, limit = 240) {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d{1,3}[.)]\s+/gm, "")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace > limit * 0.6 ? lastSpace : limit).trimEnd()}…`;
}

function daysAgo(days, hour = 9) {
  const date = new Date(Date.now() - days * 86_400_000);
  date.setUTCHours(hour, 12, 0, 0);
  return date.toISOString();
}

const totalWords = (posts) => posts.reduce((sum, post) => sum + wordCount(post.content), 0);
log(`\n  \x1b[2mfolio · db:seed\x1b[0m`);
log(`  \x1b[2mcontent\x1b[0m ${POSTS.length + DRAFTS.length} posts · ${totalWords([...POSTS, ...DRAFTS]).toLocaleString()} words\n`);

// ── 1. Authors ───────────────────────────────────────────────────────────────
const passwordHash = await hashPassword(DEMO_PASSWORD);
const authorIds = {};

for (const author of AUTHORS) {
  const { rows } = await query(
    `insert into users (email, username, display_name, password_hash, bio, tagline, avatar_hue, role)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (lower(username)) do update set
       email        = excluded.email,
       display_name = excluded.display_name,
       bio          = excluded.bio,
       tagline      = excluded.tagline,
       avatar_hue   = excluded.avatar_hue,
       role         = excluded.role,
       updated_at   = now()
     returning id`,
    [
      author.email,
      author.username,
      author.displayName,
      passwordHash,
      author.bio,
      author.tagline,
      author.avatarHue,
      author.role ?? "member",
    ],
  );
  authorIds[author.key] = rows[0].id;
  log(`  \x1b[32m✓\x1b[0m author   @${author.username.padEnd(8)} ${author.displayName}`);
}

// ── 2. Reset demo posts (cascade removes claps/comments/views/bookmarks) ──────
const demoUserIds = Object.values(authorIds);
const idList = demoUserIds.map((_, index) => `$${index + 1}`).join(", ");
const { rowCount: removed } = await query(
  `delete from posts where author_id in (${idList})`,
  demoUserIds,
);
if (removed > 0) log(`  \x1b[2mreset\x1b[0m    removed ${removed} previously seeded posts`);

// ── 3. Posts ─────────────────────────────────────────────────────────────────
const postIds = {};
const inserted = [];

for (const post of POSTS) {
  const words = wordCount(post.content);
  const publishedAt = daysAgo(post.daysAgo);
  const { rows } = await query(
    `insert into posts
       (author_id, slug, title, subtitle, content, excerpt, cover_preset, status, tags,
        word_count, reading_minutes, published_at, created_at, updated_at, featured)
     values ($1,$2,$3,$4,$5,$6,$7,'published',$8::text[],$9,$10,$11,$11,$11,$12)
     returning id`,
    [
      authorIds[post.author],
      post.slug,
      post.title,
      post.subtitle,
      post.content,
      excerptOf(post.content),
      post.coverPreset,
      post.tags,
      words,
      readingMinutes(words),
      publishedAt,
      post.featured ?? false,
    ],
  );
  postIds[post.slug] = rows[0].id;
  inserted.push({ ...post, id: rows[0].id, words });
  log(`  \x1b[32m✓\x1b[0m post     ${String(readingMinutes(words)).padStart(2)} min · ${post.title.slice(0, 52)}`);
}

for (const draft of DRAFTS) {
  const words = wordCount(draft.content);
  const { rows } = await query(
    `insert into posts
       (author_id, slug, title, subtitle, content, excerpt, cover_preset, status, tags,
        word_count, reading_minutes, updated_at)
     values ($1,$2,$3,$4,$5,$6,'linen','draft',$7::text[],$8,$9,$10)
     returning id`,
    [
      authorIds[draft.author],
      draft.slug,
      draft.title,
      draft.subtitle,
      draft.content,
      excerptOf(draft.content),
      draft.tags,
      words,
      readingMinutes(words),
      daysAgo(1),
    ],
  );
  postIds[draft.slug] = rows[0].id;
  log(`  \x1b[2m· draft    ${draft.title}\x1b[0m`);
}

// ── 4. Claps ─────────────────────────────────────────────────────────────────
const clapWeights = [46, 41, 27, 33, 18, 24, 12];
let clapRows = 0;

for (const [index, post] of inserted.entries()) {
  const target = clapWeights[index % clapWeights.length];
  const clappers = AUTHORS.filter((author) => author.key !== post.author);
  const clapCount = target;

  await query(
    `with ins as (
       insert into claps (post_id, user_id, count)
       values ($1, $2, $3)
       on conflict (post_id, user_id) do update set count = excluded.count, updated_at = now()
       returning count
     )
     update posts set clap_count = (select count from ins) where id = $1`,
    [post.id, authorIds[clappers[index % clappers.length].key], clapCount],
  );
  clapRows += 1;

  // Additional claps spread over the other demo accounts, halving each time.
  for (const [offset, author] of clappers.entries()) {
    if (offset === index % clappers.length) continue;
    const count = Math.max(1, Math.round(clapCount / (2.4 + offset)));
    await query(
      `with ins as (
         insert into claps (post_id, user_id, count)
         values ($1, $2, $3)
         on conflict (post_id, user_id) do update set count = excluded.count, updated_at = now()
         returning count
       )
       update posts set clap_count = clap_count + (select count from ins) where id = $1`,
      [post.id, authorIds[author.key], count],
    );
    clapRows += 1;
  }
}
log(`  \x1b[32m✓\x1b[0m claps    ${clapRows} rows across ${POSTS.length} posts`);

// ── 5. Comments (one level of replies) ───────────────────────────────────────
let commentRows = 0;
for (const [index, comment] of COMMENTS.entries()) {
  const postId = postIds[comment.postSlug];
  if (!postId) continue;

  let parentId = null;
  if (typeof comment.parentIndex === "number") {
    const parent = COMMENTS[comment.parentIndex];
    parentId = parent.__insertedId ?? null;
  }

  const { rows } = await query(
    `with ins as (
       insert into comments (post_id, author_id, parent_id, body, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $5)
       returning id, post_id
     )
     update posts set comment_count = comment_count + 1 where id = (select post_id from ins)
     returning (select id from ins) as id`,
    [postId, authorIds[comment.author], parentId, comment.body, daysAgo(1 + index * 0.4)],
  );
  comment.__insertedId = rows[0].id;
  commentRows += 1;
}
log(`  \x1b[32m✓\x1b[0m comments ${commentRows} rows`);

// ── 6. Follows ───────────────────────────────────────────────────────────────
const followPairs = [
  ["reader", "ada"],
  ["reader", "jun"],
  ["reader", "nour"],
  ["ada", "jun"],
  ["jun", "ada"],
  ["nour", "ada"],
  ["ada", "nour"],
];
for (const [follower, following] of followPairs) {
  await query(
    `insert into follows (follower_id, following_id) values ($1, $2)
     on conflict do nothing`,
    [authorIds[follower], authorIds[following]],
  );
}
log(`  \x1b[32m✓\x1b[0m follows  ${followPairs.length} relationships`);

// ── 7. Bookmarks + reading history for the demo reader ───────────────────────
const bookmarked = inserted.slice(0, 4);
for (const [index, post] of bookmarked.entries()) {
  await query(
    `insert into bookmarks (user_id, post_id, created_at) values ($1, $2, $3)
     on conflict do nothing`,
    [authorIds.reader, post.id, daysAgo(index + 1)],
  );
}
for (const [index, post] of inserted.slice(2, 7).entries()) {
  await query(
    `insert into reading_history (user_id, post_id, progress, last_read_at) values ($1, $2, $3, $4)
     on conflict (user_id, post_id) do update set progress = excluded.progress, last_read_at = excluded.last_read_at`,
    [authorIds.reader, post.id, [1, 0.62, 0.88, 1, 0.34][index], daysAgo(index * 0.7)],
  );
}
log(`  \x1b[32m✓\x1b[0m library  ${bookmarked.length} bookmarks · 5 history entries`);

// ── 8. Reader analytics (the creator dashboard runs on this table) ────────────
const random = mulberry32(20260923);
let viewRows = 0;

for (const [index, post] of inserted.entries()) {
  const audience = 48 + Math.round(random() * 220) - index * 6;
  const readers = Math.max(12, audience);

  for (let i = 0; i < readers; i += 1) {
    const depth = Math.min(1, 0.18 + random() * 1.05);
    const minutes = readingMinutes(post.words);
    const readSeconds = Math.round(depth * minutes * 60 * (0.72 + random() * 0.55));
    const when = daysAgo(post.daysAgo - Math.min(post.daysAgo, random() * post.daysAgo * 0.92), 6 + Math.floor(random() * 16));

    await query(
      `insert into post_views (post_id, viewer_hash, user_id, read_seconds, read_ratio, referrer, created_at, updated_at)
       values ($1, $2, null, $3, $4, $5, $6, $6)
       on conflict (post_id, viewer_hash) do nothing`,
      [
        post.id,
        `seed_${post.slug.slice(0, 8)}_${i}_${Math.floor(random() * 1e6).toString(36)}`,
        readSeconds,
        Number(depth.toFixed(3)),
        ["", "https://news.ycombinator.com", "https://x.com", "https://folio.dev/explore"][Math.floor(random() * 4)],
        when,
      ],
    );
    viewRows += 1;
  }

  await query(`update posts set view_count = $2 where id = $1`, [post.id, readers + Math.round(random() * 90)]);
}
log(`  \x1b[32m✓\x1b[0m analytics ${viewRows} reader sessions`);

// ── 9. Tag stats (drives the explore rail) ───────────────────────────────────
await query(`delete from tag_stats`);
await query(
  `insert into tag_stats (tag, post_count, clap_count, last_post_at)
   select tag,
          count(*)::int,
          coalesce(sum(p.clap_count), 0)::int,
          max(coalesce(p.published_at, p.created_at))
     from posts p, unnest(p.tags) as tag
    where p.status = 'published'
    group by tag
   on conflict (tag) do update set
     post_count   = excluded.post_count,
     clap_count   = excluded.clap_count,
     last_post_at = excluded.last_post_at`,
);
const { rows: tagRows } = await query(`select count(*)::int as n from tag_stats`);
log(`  \x1b[32m✓\x1b[0m tags     ${tagRows[0].n} tags indexed`);

// ── Done ─────────────────────────────────────────────────────────────────────
const { rows: totals } = await query(
  `select
     (select count(*)::int from users)     as users,
     (select count(*)::int from posts)     as posts,
     (select count(*)::int from claps)     as claps,
     (select count(*)::int from comments)  as comments`,
);

log(`\n  \x1b[1mdatabase ready\x1b[0m`);
log(`  ${totals[0].users} users · ${totals[0].posts} posts · ${totals[0].claps} claps · ${totals[0].comments} comments`);
log(`\n  sign in with \x1b[1mdemo@folio.dev\x1b[0m / \x1b[1m${DEMO_PASSWORD}\x1b[0m`);
log(`  or register a new account at \x1b[1m/signup\x1b[0m\n`);
