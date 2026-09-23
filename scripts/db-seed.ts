/**
 * scripts/db-seed.ts — loads the demo corpus into Neon.
 *
 *   npm run db:seed
 *
 * Uses the same statements as the in-memory seeder so both environments end up
 * structurally identical.
 */

import { pathToFileURL } from 'node:url';
import { query } from '@/lib/db';
import { COMMENTS, DEMO_PASSWORD_HASH, PEOPLE, POSTS } from '@/lib/db/seed-data';
import { countWords, excerptFrom, markdownToHtml, readMinutes } from '@/lib/utils/markdown';
import { slugify } from '@/lib/utils/slug';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set — refusing to seed. The in-memory engine seeds itself automatically.');
    process.exit(1);
  }

  const existing = await query<{ n: number }>(`select count(*) as n from users`);
  if (Number(existing[0]?.n ?? 0) > 0) {
    console.log('Database already contains users — skipping seed.');
    return;
  }

  for (const person of PEOPLE) {
    await query(
      `insert into users (email, username, display_name, password_hash, bio, location)
       values ($1, $2, $3, $4, $5, $6)`,
      [`${person.username}@folio.test`, person.username, person.name, DEMO_PASSWORD_HASH, person.bio, person.location],
    );
  }
  console.log(`✓ ${PEOPLE.length} users (password: folio-demo)`);

  for (const [index, post] of POSTS.entries()) {
    const publishedAt = new Date(Date.now() - post.hoursAgo * 3_600_000);
    await query(
      `insert into posts (author_id, slug, title, subtitle, content, content_html, excerpt,
                          cover_url, status, word_count, read_minutes, view_count, published_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        post.author + 1,
        `${slugify(post.title)}-${index + 1}`,
        post.title,
        post.subtitle,
        post.body,
        markdownToHtml(post.body),
        excerptFrom(post.body),
        null,
        'published',
        countWords(post.body),
        readMinutes(post.body),
        post.views,
        publishedAt.toISOString(),
      ],
    );
    for (const tag of post.tags) {
      await query(`insert into tags (slug, name) values ($1, $2) on conflict (slug) do nothing`, [
        tag,
        tag.replace(/-/g, ' '),
      ]);
      await query(
        `insert into post_tags (post_id, tag_id)
         select $1, id from tags where slug = $2
         on conflict (post_id, tag_id) do nothing`,
        [index + 1, tag],
      );
    }
  }
  console.log(`✓ ${POSTS.length} posts with tags`);

  const claps: [number, number][] = [
    [1, 2], [1, 3], [1, 4], [2, 1], [2, 4], [3, 1], [3, 2],
    [3, 3], [3, 4], [4, 1], [5, 2], [5, 3], [6, 4],
  ];
  for (const [postId, userId] of claps) {
    await query(
      `insert into claps (post_id, user_id, count) values ($1, $2, 1)
       on conflict (post_id, user_id) do nothing`,
      [postId, userId],
    );
    await query(`update posts set clap_count = clap_count + 1 where id = $1`, [postId]);
  }

  for (const comment of COMMENTS) {
    await query(
      `insert into comments (post_id, user_id, parent_id, body, created_at)
       values ($1, $2, $3, $4, $5)`,
      [comment.post, comment.author + 1, null, comment.body, new Date(Date.now() - comment.hoursAgo * 3_600_000).toISOString()],
    );
    await query(`update posts set comment_count = comment_count + 1 where id = $1`, [comment.post]);
  }
  console.log(`✓ ${claps.length} claps, ${COMMENTS.length} comments`);

  console.log('\nDone. Sign in with ada@folio.test / folio-demo');
}

/** Runs only when executed directly, so this module stays importable. */
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) void main();
