/**
 * lib/db/seed-data.ts — the demo corpus, shared by the in-memory engine
 * (lib/db/seed-memory.ts) and `npm run db:seed` against Neon.
 *
 * Sign in as `ada@folio.test` with the password `folio-demo`.
 */

export interface SeedPerson {
  username: string;
  name: string;
  bio: string;
  location: string;
}

export interface SeedPost {
  author: number;
  title: string;
  subtitle: string;
  tags: string[];
  hoursAgo: number;
  views: number;
  body: string;
}

export interface SeedComment {
  post: number;
  author: number;
  body: string;
  hoursAgo: number;
}

export const DEMO_PASSWORD_HASH =
  'pbkdf2$sha256$210000$0PLaUwvQ2bv_Q-ZTFUTTow$bF2dHtmlWUtQhDOCqLpV3azO75vugIQM8c7VsyTaPOI';

export const PEOPLE: SeedPerson[] = [
  { username: 'ada', name: 'Ada Lovelace', bio: 'Writing about computation, notation and the joy of a clean abstraction.', location: 'London' },
  { username: 'grace', name: 'Grace Hopper', bio: 'Compilers, queues, and the nanosecond.', location: 'Arlington' },
  { username: 'alan', name: 'Alan Turing', bio: 'Machines, morphogenesis and long runs.', location: 'Wilmslow' },
  { username: 'margaret', name: 'Margaret Hamilton', bio: 'Software engineering as a discipline. Priority interrupts forever.', location: 'Cambridge, MA' },
];

export const POSTS: SeedPost[] = [
  {
    author: 0,
    title: 'The case for writing SQL by hand in 2026',
    subtitle: 'An ORM is a convenience you pay for on every cold start.',
    tags: ['engineering', 'postgres', 'serverless'],
    hoursAgo: 3,
    views: 412,
    body: `Every abstraction has a latency budget, and on a serverless platform that budget is paid in milliseconds you do not have.

## What an ORM actually costs

A generated client is code. Code has to be parsed, instantiated and warmed before the first query leaves the function. On a cold start that is routinely 80–200 ms of work that has nothing to do with your data.

A raw query is a string and an array:

\`\`\`ts
const rows = await sql.query(
  'select id, title from posts where status = $1 order by published_at desc limit $2',
  ['published', 20],
);
\`\`\`

No client. No cache of prepared statements. No connection pool to exhaust when a hundred functions wake up at once.

## What you give up

You give up autocomplete on a generated type. That is a real loss, and it is worth paying, because you get:

- one round-trip per screen, shaped exactly like the screen
- a query plan you can read in the file next to the UI it serves
- an ~40 kB dependency instead of a codegen step in CI

> The best query is the one you can see.

Write the SQL. Put it next to the component that needs it. Type the result by hand once, and move on.`,
  },
  {
    author: 1,
    title: 'Web Crypto is an entire auth library you already ship',
    subtitle: 'PBKDF2, HMAC and constant-time comparison — no npm install required.',
    tags: ['security', 'engineering'],
    hoursAgo: 9,
    views: 289,
    body: `The browser and the Edge runtime both implement \`crypto.subtle\`. That single global gives you everything a session system needs.

## The four primitives

1. **PBKDF2-HMAC-SHA256** for passwords. Argon2 is stronger, but it is not in the platform, and reaching for a native module defeats the point.
2. **HMAC-SHA256** to seal the session cookie, so the routing layer can reject forgeries without a database call.
3. **SHA-256** to store session tokens as hashes, so a database leak cannot be replayed.
4. **Constant-time comparison**, because \`===\` leaks length and timing.

## Why not JWT?

A JWT is a payload you have to trust yourself not to trust. Sessions stored server-side are revocable with one \`DELETE\`, carry no algorithm-confusion risk, and cost the same single lookup you were going to make anyway.

\`\`\`ts
const sealed = \`\${token}.\${await hmac(secret, token)}\`;
\`\`\`

Two hundred lines, zero dependencies, and an attack surface you can explain in a sentence.`,
  },
  {
    author: 2,
    title: 'Incremental Static Regeneration is the most underrated feature in Next.js',
    subtitle: 'Prerender the shell, personalise the islands, invalidate on write.',
    tags: ['nextjs', 'performance'],
    hoursAgo: 26,
    views: 631,
    body: `Most "dynamic" pages are 95% identical for every visitor. The article body, the author card, the related stories — none of that changes per reader.

## The split

- Prerender the document with \`export const revalidate = 60\`.
- Read the cookie **only** in small client islands that fetch their own state.
- Call \`revalidatePath\` the moment the author publishes, so edits are visible immediately instead of after the interval.

You get a cache hit on the hot route *and* a personalised UI. The islands cost one small JSON request each, which is nothing next to the render you just avoided.

## A rule of thumb

If a page reads \`cookies()\` in its layout, you have made every page behind that layout dynamic. Keep the shared shell pure and push personalisation to the edges of the tree.`,
  },
  {
    author: 3,
    title: 'Priority interrupts and the discipline of shipping software',
    subtitle: 'What flying Apollo taught me about error handling.',
    tags: ['engineering', 'leadership'],
    hoursAgo: 52,
    views: 978,
    body: `The computer had four kilobytes of memory and a job to do: land on the Moon.

Twelve minutes before landing it started screaming. The guidance computer was saturated, and the astronauts had to decide, in seconds, whether to trust the machine or abort.

## Software that fails well

The program had been built with an executive that could shed low-priority work and keep the critical loop alive. That is the whole lesson: **decide in advance what you will drop**.

- Rank your tasks. Not later — before the alarm.
- Make the important path boring and testable.
- Log enough to reconstruct the moment, and no more.

> If you have not decided what to abandon, the incident will decide for you.

Every system I have built since has been an argument with that twelve-minute window.`,
  },
  {
    author: 0,
    title: 'A reading experience is a design decision, not a stylesheet',
    subtitle: 'Line length, type scale and the courage to remove things.',
    tags: ['design', 'typography'],
    hoursAgo: 74,
    views: 344,
    body: `Readers do not notice good typography. They notice when they get tired.

## The three levers that matter

**Measure.** Somewhere between 60 and 75 characters per line. Wider and the eye loses the return sweep; narrower and the rhythm breaks into stutters.

**Scale.** A body size around 19px, a line-height near 1.7, and headings that step down by a consistent ratio. Everything else is decoration.

**Contrast that is not maximum.** Pure black on pure white vibrates. Off-black on off-white reads for an hour longer.

## Let the reader decide

Serif or sans, narrow or wide, small or large — the person reading at midnight has different needs from the person reading at noon. Expose three controls, remember the choice, and get out of the way.`,
  },
  {
    author: 1,
    title: 'Denormalise on purpose, and make the counters self-healing',
    subtitle: 'Triggers are elegant. Recounts are correct.',
    tags: ['postgres', 'data'],
    hoursAgo: 96,
    views: 205,
    body: `A \`clap_count\` column on the posts table saves a \`count(*)\` on every feed render. That trade is almost always worth it.

The question is what happens when it drifts.

## Drift is not a bug, it is a certainty

Cascading deletes, retried writes, a partial migration — any of them will leave a counter disagreeing with the rows behind it. So:

\`\`\`sql
update posts
set comment_count = (select count(*) from comments where post_id = $1)
where id = $1;
\`\`\`

Recount from the source of truth on the operations that can cascade. It is one extra subquery on a rare path, and it makes the number self-correcting.

Keep the denormalised column. Just never let it be the only opinion.`,
  },
  {
    author: 2,
    title: 'Your first 10,000 readers do not need a queue',
    subtitle: 'Postgres, a CDN and a cache tag will outlast most of your stack.',
    tags: ['serverless', 'architecture'],
    hoursAgo: 130,
    views: 152,
    body: `There is a version of this system with Redis, Kafka, a search cluster and a worker fleet. You do not need it yet.

## What actually scales

- **A CDN in front of prerendered pages.** The reader never touches your function.
- **An indexed query per screen.** One round-trip, no fan-out.
- **An append-only event table** for analytics, de-duplicated by a unique constraint.
- **Cache invalidation by tag**, triggered on write.

Each of those is a single Postgres feature or a single platform feature. None of them is a new service to operate, monitor or pay for at 3am.

> Add infrastructure when a measurement tells you to, not when a blog post does.`,
  },
];

export const COMMENTS: SeedComment[] = [
  { post: 0, author: 1, body: 'The "one round-trip per screen" framing is the part people miss. Nice piece.', hoursAgo: 2 },
  { post: 0, author: 2, body: 'Counterpoint: the typegen pays for itself on a team of ten. For a solo build, agreed.', hoursAgo: 1 },
  { post: 1, author: 3, body: 'Constant-time comparison is the detail everyone forgets. Thank you for including it.', hoursAgo: 6 },
  { post: 2, author: 0, body: 'This is exactly the split we landed on. The islands pattern is underrated.', hoursAgo: 20 },
  { post: 3, author: 1, body: '"Decide in advance what you will drop" belongs on a poster.', hoursAgo: 40 },
];

