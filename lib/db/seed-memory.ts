/**
 * lib/db/seed-memory.ts — demo content for the in-memory engine.
 *
 * Runs only when no DATABASE_URL is configured, and runs *synchronously* on
 * first access so the very first request already renders a full feed. The rows
 * are written through the same SQL the app uses, so the demo exercises the real
 * statements rather than a parallel fixture format.
 */

import { memoryDb } from './engine';
import { COMMENTS, DEMO_PASSWORD_HASH, PEOPLE, POSTS, type SeedPost } from './seed-data';
import { countWords, excerptFrom, markdownToHtml, readMinutes } from '@/lib/utils/markdown';
import { slugify } from '@/lib/utils/slug';

function insertPost(index: number, seed: SeedPost) {
  const html = markdownToHtml(seed.body);
  const publishedAt = new Date(Date.now() - seed.hoursAgo * 3_600_000).toISOString();

  memoryDb.exec(
    `insert into posts (author_id, slug, title, subtitle, content, content_html, excerpt,
                        cover_url, status, word_count, read_minutes, view_count, published_at, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13, $13)`,
    [
      seed.author + 1,
      `${slugify(seed.title)}-${index + 1}`,
      seed.title,
      seed.subtitle,
      seed.body,
      html,
      excerptFrom(seed.body),
      null,
      'published',
      countWords(seed.body),
      readMinutes(seed.body),
      seed.views,
      publishedAt,
    ],
  );
}

/**
 * Seeds the in-memory database. Idempotent, synchronous, and only ever called
 * when the app is not connected to Neon.
 */
export function seedMemoryDatabase(): void {
  if (memoryDb.tables.users.length > 0) return;

  for (const person of PEOPLE) {
    memoryDb.exec(
      `insert into users (email, username, display_name, password_hash, bio, location)
       values ($1, $2, $3, $4, $5, $6)`,
      [`${person.username}@folio.test`, person.username, person.name, DEMO_PASSWORD_HASH, person.bio, person.location],
    );
  }

  POSTS.forEach((post, index) => insertPost(index, post));

  const tagNames = new Set(POSTS.flatMap((post) => post.tags));
  for (const name of tagNames) {
    memoryDb.exec(`insert into tags (slug, name) values ($1, $2) on conflict (slug) do nothing`, [
      name,
      name.replace(/-/g, ' '),
    ]);
  }
  POSTS.forEach((post, index) => {
    for (const tag of post.tags) {
      memoryDb.exec(
        `insert into post_tags (post_id, tag_id)
         select $1, id from tags where slug = $2
         on conflict (post_id, tag_id) do nothing`,
        [index + 1, tag],
      );
    }
  });

  const clapPattern: [number, number][] = [
    [1, 2], [1, 3], [1, 4], [2, 1], [2, 4], [3, 1], [3, 2],
    [3, 3], [3, 4], [4, 1], [5, 2], [5, 3], [6, 4],
  ];
  for (const [postId, userId] of clapPattern) {
    memoryDb.exec(`insert into claps (post_id, user_id, count) values ($1, $2, 1)`, [postId, userId]);
    memoryDb.exec(`update posts set clap_count = clap_count + 1 where id = $1`, [postId]);
  }
  memoryDb.exec(`insert into bookmarks (post_id, user_id) values ($1, $2)`, [1, 2]);
  memoryDb.exec(`insert into bookmarks (post_id, user_id) values ($1, $2)`, [3, 2]);

  for (const comment of COMMENTS) {
    memoryDb.exec(
      `insert into comments (post_id, user_id, parent_id, body, created_at)
       values ($1, $2, $3, $4, $5)`,
      [comment.post, comment.author + 1, null, comment.body, new Date(Date.now() - comment.hoursAgo * 3_600_000).toISOString()],
    );
    memoryDb.exec(`update posts set comment_count = comment_count + 1 where id = $1`, [comment.post]);
  }

  POSTS.forEach((post, index) => {
    const readers = Math.min(6, Math.max(2, Math.round(post.views / 120)));
    for (let day = 0; day < 7; day++) {
      for (let reader = 0; reader < readers - (day % 3); reader++) {
        const created = new Date(Date.now() - day * 86_400_000 - reader * 3_600_000).toISOString();
        memoryDb.exec(
          `insert into post_views (post_id, viewer_key, day, created_at)
           values ($1, $2, $3, $4)
           on conflict (post_id, viewer_key, day) do nothing`,
          [index + 1, `seed-reader-${reader}-${day % 4}`, created.slice(0, 10), created],
        );
      }
    }
  });
}
