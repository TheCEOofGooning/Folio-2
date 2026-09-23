/**
 * tests/db-memory.test.ts — runs the *real* query builders in lib/db/queries
 * against the in-memory Postgres engine.
 *
 * This is the check that matters for the data layer: the exact SQL that ships
 * to Neon is parsed and executed here, so a malformed statement, a wrong join
 * or a broken counter update fails the suite instead of failing in production.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

// Start from an empty database even though the memory engine self-seeds in dev.
process.env.FOLIO_NO_SEED = '1';

import { query } from '@/lib/db';
import { memoryDb } from '@/lib/db/engine';
import { addClap, addComment, deleteComment, getReaderClaps, listComments, listClappedPosts, recordView, removeClaps, toggleBookmark } from '@/lib/db/queries/engage';
import {
  createDraft,
  deletePost,
  getPostById,
  getPublishedPostBySlug,
  getOwnPostBySlug,
  getRelatedPosts,
  listCreatorPosts,
  listPopularTags,
  listPosts,
  listPostsByAuthor,
  listPostsByTag,
  publishPost,
  searchPosts,
  selectPosts,
  setTags,
  trendingScore,
  unpublishPost,
  updatePost,
} from '@/lib/db/queries/posts';
import { getAuthorStats, getPostBreakdown, getTopPosts, getViewSeries } from '@/lib/db/queries/stats';
import { createUser, getProfileByUsername, getSavedPosts } from '@/lib/db/queries/users';
import { countWords, markdownToHtml, readMinutes } from '@/lib/utils/markdown';
import { uniqueSlug } from '@/lib/utils/slug';

const BODY = [
  '# Why raw SQL',
  '',
  'An ORM is a **convenience** you pay for on every cold start.',
  '',
  '> Every abstraction is a latency budget.',
  '',
  '- no codegen',
  '- no connection pool',
].join('\n');

async function makeAuthor(username: string) {
  const user = await createUser({
    email: `${username}@folio.test`,
    username,
    displayName: username.toUpperCase(),
    passwordHash: 'pbkdf2$sha256$210000$c2FsdA$c2FsdA',
  });
  return user;
}

async function makePost(authorId: number, title: string, tags: string[]) {
  const content = BODY;
  const draft = await createDraft({
    authorId,
    title,
    subtitle: 'A short subtitle',
    content,
    contentHtml: markdownToHtml(content),
    excerpt: 'An ORM is a convenience you pay for on every cold start.',
    coverUrl: null,
    tags,
    slug: uniqueSlug(title),
    wordCount: countWords(content),
    readMinutes: readMinutes(content),
  });
  await publishPost(draft.id);
  return draft;
}

test('registers a user and reads the profile back', async () => {
  const user = await makeAuthor('ada');
  assert.ok(user.id > 0);
  assert.equal(user.email, 'ada@folio.test');

  const profile = await getProfileByUsername('ada');
  assert.ok(profile);
  assert.equal(profile.username, 'ada');
  assert.equal(profile.display_name, 'ADA');
  assert.equal(Number(profile.published_count), 0);
  assert.equal(Number(profile.total_views ?? 0), 0);
});

test('drafts, publishes and lists a post with its tags', async () => {
  const author = await makeAuthor('grace');
  const post = await makePost(author.id, 'Why raw SQL wins on serverless', ['engineering', 'postgres']);

  const published = await listPosts({ status: 'published', limit: 10 });
  assert.equal(published.length, 1);
  assert.equal(published[0].id, post.id);
  assert.equal(published[0].title, 'Why raw SQL wins on serverless');
  assert.equal(published[0].username, 'grace');
  assert.deepEqual([...(published[0].tags ?? [])].sort(), ['engineering', 'postgres']);
  assert.equal(published[0].clapped, false);
  assert.equal(published[0].bookmarked, false);
  assert.ok(published[0].published_at instanceof Date, 'timestamps must be normalised to Date');

  const byTag = await listPostsByTag('postgres');
  assert.equal(byTag.length, 1);
  const missingTag = await listPostsByTag('rust');
  assert.equal(missingTag.length, 0);

  const byAuthor = await listPostsByAuthor(author.id);
  assert.equal(byAuthor.length, 1);

  const detail = await getPublishedPostBySlug(post.slug);
  assert.ok(detail);
  assert.match(detail.content_html, /<h2/);
  assert.equal(detail.status, 'published');
});

test('tags are shared, de-duplicated and counted from post_tags', async () => {
  const author = await makeAuthor('linus');
  await makePost(author.id, 'Second post about Postgres', ['postgres', 'POSTGRES', 'postgres ']);

  const tags = await listPopularTags();
  const postgres = tags.find((t) => t.slug === 'postgres');
  assert.ok(postgres, 'expected a postgres tag');
  assert.equal(Number(postgres.post_count), 2, 'tag counts are derived, and duplicates collapse');
  assert.equal(tags.find((t) => t.slug === 'engineering')?.post_count, 1);
});

test('search matches titles and usernames', async () => {
  const byTitle = await searchPosts('raw sql');
  assert.equal(byTitle.length, 1);
  assert.equal(byTitle[0].title, 'Why raw SQL wins on serverless');

  const byAuthor = await searchPosts('grace');
  assert.equal(byAuthor.length, 1);

  const nothing = await searchPosts('zzzz-no-match');
  assert.equal(nothing.length, 0);
});

test('claps accumulate, are idempotent per reader, and reverse cleanly', async () => {
  const author = await makeAuthor('ken');
  const post = await makePost(author.id, 'Clapping mechanics', ['product']);
  const reader = await makeAuthor('reader-one');

  assert.equal(await getReaderClaps(post.id, reader.id), 0);
  assert.equal(await addClap(post.id, reader.id), 1);
  assert.equal(await addClap(post.id, reader.id), 2);
  assert.equal(await getReaderClaps(post.id, reader.id), 2);

  const clapped = await selectPosts({ status: 'published', userId: reader.id });
  const mine = clapped.find((p) => p.id === post.id);
  assert.equal(mine?.clapped, true);
  assert.equal(mine?.clap_count, 2);

  assert.equal(await removeClaps(post.id, reader.id), 0);
  assert.equal(await getReaderClaps(post.id, reader.id), 0);

  const after = await listClappedPosts(reader.id);
  assert.equal(after.length, 0);
});

test('bookmarks toggle and the saved list is newest-first', async () => {
  const author = await makeAuthor('barbara');
  const first = await makePost(author.id, 'First saved', ['lists']);
  const second = await makePost(author.id, 'Second saved', ['lists']);
  const reader = await makeAuthor('reader-two');

  assert.equal(await toggleBookmark(first.id, reader.id), true);
  assert.equal(await toggleBookmark(second.id, reader.id), true);
  const saved = await getSavedPosts(reader.id);
  assert.equal(saved.length, 2);
  assert.equal(saved[0].id, second.id, 'most recently saved first');
  assert.equal(saved.every((p) => p.bookmarked), true);

  assert.equal(await toggleBookmark(second.id, reader.id), false);
  assert.equal((await getSavedPosts(reader.id)).length, 1);
});

test('comments are stored, threaded, counted and removable by their author only', async () => {
  const author = await makeAuthor('dennis');
  const post = await makePost(author.id, 'Comment threading', ['community']);
  const reader = await makeAuthor('reader-three');
  const stranger = await makeAuthor('reader-four');

  const root = await addComment({ postId: post.id, userId: reader.id, body: 'Great piece.' });
  assert.ok(root);
  await addComment({ postId: post.id, userId: author.id, body: 'Thank you!', parentId: root.id });

  const comments = await listComments(post.id);
  assert.equal(comments.length, 2);
  assert.equal(comments[0].username, 'reader-three');
  assert.equal(comments[1].parent_id, root.id);
  assert.equal(comments[0].display_name, 'READER-THREE');

  const detail = await getPublishedPostBySlug(post.slug);
  assert.equal(detail?.comment_count, 2);

  await deleteComment(root.id, stranger.id);
  assert.equal((await listComments(post.id)).length, 2, 'a stranger cannot delete it');

  await deleteComment(root.id, reader.id);
  const remaining = await listComments(post.id);
  assert.equal(remaining.length, 0, 'deleting the parent cascades to the reply');
  assert.equal(
    (await getPublishedPostBySlug(post.slug))?.comment_count,
    0,
    'the counter is recounted, so it survives the cascade',
  );
});

test('view tracking de-duplicates per reader per day and feeds analytics', async () => {
  const author = await makeAuthor('margaret');
  const post = await makePost(author.id, 'Analytics plumbing', ['data']);

  assert.equal(await recordView(post.id, 'viewer-a'), true);
  assert.equal(await recordView(post.id, 'viewer-a'), false, 'same reader, same day');
  assert.equal(await recordView(post.id, 'viewer-b'), true);

  const detail = await getPublishedPostBySlug(post.slug);
  assert.equal(detail?.view_count, 2);

  const series = await getViewSeries(author.id, 30);
  assert.equal(series.length, 1);
  assert.equal(Number(series[0].views), 2);
  assert.match(String(series[0].day), /^\d{4}-\d{2}-\d{2}$/);

  const stats = await getAuthorStats(author.id);
  assert.equal(stats.total_views, 2);
  assert.equal(stats.published, 1);
  assert.equal(stats.drafts, 0);
  assert.equal(stats.total_readers, 2, 'unique readers, not page views');

  const top = await getTopPosts(author.id);
  assert.equal(top.length, 1);
  assert.equal(top[0].view_count, 2);
  assert.equal((await getPostBreakdown(author.id)).length, 1);
});

test('editing, unpublishing and deleting move a post through its lifecycle', async () => {
  const author = await makeAuthor('alan');
  const post = await makePost(author.id, 'Original title', ['drafts']);

  await updatePost({
    id: post.id,
    title: 'Updated title',
    subtitle: 'New subtitle',
    content: 'Revised body text.',
    contentHtml: markdownToHtml('Revised body text.'),
    excerpt: 'Revised body text.',
    coverUrl: 'https://cdn.example.com/cover.png',
    tags: ['drafts', 'editing'],
    wordCount: 3,
    readMinutes: 1,
  });

  const updated = await getOwnPostBySlug(post.slug, author.id);
  assert.equal(updated?.title, 'Updated title');
  assert.equal(updated?.cover_url, 'https://cdn.example.com/cover.png');
  assert.deepEqual([...(updated?.tags ?? [])].sort(), ['drafts', 'editing']);

  await setTags(post.id, ['editing']);
  assert.deepEqual((await getPublishedPostBySlug(post.slug))?.tags, ['editing']);

  await unpublishPost(post.id);
  assert.equal((await listPosts({ status: 'published', authorId: author.id })).length, 0);
  assert.equal(await getPublishedPostBySlug(post.slug), null, 'unpublished posts leave the public feed');
  assert.ok(await getOwnPostBySlug(post.slug, author.id), 'the author can still open it');

  const related = await getRelatedPosts(post.id, author.id);
  assert.equal(related.length, 0);

  await deletePost(post.id);
  assert.equal(await getPostById(post.id), null);
  assert.equal(memoryDb.tables.post_tags.filter((r) => r.post_id === post.id).length, 0, 'cascade removed tag links');
});

test('the creator dashboard lists drafts and published together', async () => {
  const author = await makeAuthor('dashboard-user');
  const published = await makePost(author.id, 'Published one', ['ops']);
  const draft = await createDraft({
    authorId: author.id,
    title: 'A quiet draft',
    content: 'unfinished',
    contentHtml: markdownToHtml('unfinished'),
    tags: [],
    slug: uniqueSlug('A quiet draft'),
    wordCount: 1,
    readMinutes: 1,
  });

  const rows = await listCreatorPosts(author.id);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, 'draft', 'drafts sort first (status asc)');
  assert.equal(rows[0].id, draft.id);
  assert.ok(rows.some((r) => r.id === published.id));

  const stats = await getAuthorStats(author.id);
  assert.equal(stats.published, 1);
  assert.equal(stats.drafts, 1);
});

test('trending ranks by engagement per hour, not by raw views', () => {
  const now = Date.now();
  const fresh = { view_count: 20, clap_count: 10, comment_count: 2, published_at: new Date(now - 3_600_000) };
  const stale = { view_count: 500, clap_count: 10, comment_count: 2, published_at: new Date(now - 86_400_000 * 30) };
  assert.ok(trendingScore(fresh, now) > trendingScore(stale, now), 'recency must outweigh raw views');
});

test('trending returns the same posts as the feed, re-ranked', async () => {
  const trending = await listPosts({ status: 'published', sort: 'trending', limit: 5 });
  const latest = await listPosts({ status: 'published', sort: 'latest', limit: 100 });
  assert.ok(trending.length > 0);
  assert.ok(trending.every((t) => latest.some((l) => l.id === t.id)));
});

test('aggregate-only queries return a row even with no data', async () => {
  const stats = await getAuthorStats(999_999);
  assert.deepEqual(stats, {
    total_views: 0,
    total_claps: 0,
    total_comments: 0,
    total_read_minutes: 0,
    published: 0,
    drafts: 0,
    total_readers: 0,
  });
  assert.deepEqual(await getViewSeries(999_999), []);
});

test('the engine understands the SQL dialect the app relies on', async () => {
  // Interval arithmetic + CTE + grouped aggregate, all in one statement.
  const rows = await query<{ bucket: string; total: number }>(
    `with recent as (
       select author_id, view_count from posts where published_at >= now() - interval '30 days'
     )
     select 'window' as bucket, sum(view_count) as total
     from recent
     group by 1 + 0
     limit 1`,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bucket, 'window');
  assert.ok(Number(rows[0].total) >= 0);

  const counts = await query<{ status: string; n: number }>(
    `select status, count(*) as n from posts group by status order by status asc`,
  );
  assert.ok(counts.length >= 1);
  assert.ok(counts.every((row) => Number(row.n) > 0));
});
