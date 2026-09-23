/**
 * Demo content for `npm run db:seed`.
 *
 * Kept apart from the seeding logic so the content can be edited (or replaced
 * with your own publication) without touching anything that talks to Postgres.
 * Bodies are Markdown — the same dialect the Folio editor produces.
 */

export const DEMO_PASSWORD = "folio-demo";

export const AUTHORS = [
  {
    key: "ada",
    email: "ada@folio.dev",
    username: "ada",
    displayName: "Ada Merrill",
    tagline: "Essayist. Writes about craft, tools and attention.",
    bio: "I write short essays about the craft of making things — software, sentences, and the occasional chair. Formerly a systems engineer, now mostly a person with a notebook.",
    avatarHue: 22,
    role: "admin",
  },
  {
    key: "jun",
    email: "jun@folio.dev",
    username: "jun",
    displayName: "Jun Park",
    tagline: "Infrastructure engineer. Allergic to unnecessary abstractions.",
    bio: "Infrastructure engineer working on serverless databases and the strange economics of cold starts. I believe most systems get faster when you delete code.",
    avatarHue: 200,
  },
  {
    key: "nour",
    email: "nour@folio.dev",
    username: "nour",
    displayName: "Nour Haddad",
    tagline: "Interface designer. Typography, spacing, restraint.",
    bio: "Designer of interfaces that get out of the way. I care about type scales, line height, and the kind of quiet that makes reading possible.",
    avatarHue: 320,
  },
  {
    key: "reader",
    email: "demo@folio.dev",
    username: "reader",
    displayName: "Demo Reader",
    tagline: "Testing the reader experience.",
    bio: "This account exists so you can sign in and try Folio immediately.",
    avatarHue: 260,
  },
];

export const POSTS = [
  {
    author: "nour",
    slug: "the-quiet-power-of-typography-driven-design",
    title: "The Quiet Power of Typography-Driven Design",
    subtitle:
      "Before you add a gradient, a card, or an icon — try setting the type properly. It is astonishing how often that is the whole fix.",
    tags: ["design", "typography", "craft"],
    featured: true,
    daysAgo: 2,
    coverPreset: "linen",
    content: `There is a particular kind of interface that feels expensive without being decorated. It has no gradients, no glass, no illustrations. It has three type sizes and an enormous amount of white space, and it is more persuasive than anything I have designed with a component library.

I have spent a decade learning the same lesson from different angles: **most design problems that look like layout problems are actually type problems.**

## Measure is the first decision

A line of text should hold between 45 and 75 characters. That is not a stylistic preference, it is the shape of the human eye's return sweep. When a line is too long, the reader loses their place on the way back; when it is too short, the rhythm breaks into a stutter.

So before anything else, set your measure. On a wide screen that usually means the column is narrower than your instinct wants it to be. Fight the instinct. A 640-pixel column of 19-pixel text at 1.7 line height reads better than a 1200-pixel column of 16-pixel text at 1.5 — always, in every test I have ever run.

## Hierarchy comes from contrast, not colour

Amateurs build hierarchy with colour: blue links, grey captions, red errors. Professionals build it with size, weight and space:

- One size for the title, meaningfully larger than everything else
- One size for the body
- One size for metadata, smaller *and* quieter
- Space between blocks, roughly equal to the line height

The trick is that when hierarchy is carried by scale and rhythm, colour becomes free. You can then use colour for exactly one thing — signalling that something is interactive — and it will read instantly, because nothing else competes with it.

> A design system is not a set of components. It is a small number of decisions, repeated without exception.

## The two-font rule

I use a serif for reading and a sans for everything else. Playfair Display for headlines if the publication wants a voice; Inter for interface, metadata and small caps. Two families, three weights, no exceptions.

Mixing more than two families is not a style, it is a symptom of not having decided. Every additional family costs you a font file, a flash of unstyled text, and the reader's trust in your judgement.

## What this buys you

When type is the whole design, three things happen at once:

1. **It loads fast.** Two font files and a CSS file. There is nothing to hydrate, nothing to animate on scroll, nothing to lay out twice.
2. **It scales.** Add a dark mode by flipping two variables. Add a mobile layout by dropping the measure and the display size. Nothing breaks, because nothing is pixel-locked.
3. **It ages well.** The interfaces I built ten years ago that still look decent are the ones with no ornament. Ornament dates; proportion does not.

The next time a screen feels wrong, resist the urge to add. Take away the border, drop the shadow, make the type one step bigger and set the measure properly. More often than you would expect, that is the entire fix.`,
  },
  {
    author: "jun",
    slug: "postgres-over-http-zero-cold-starts",
    title: "Postgres Over HTTP: Zero Dependencies, Zero Cold Starts",
    subtitle:
      "Serverless databases speak HTTP now. If you delete the driver, the connection pool and the ORM, you get a backend that starts in single-digit milliseconds.",
    tags: ["engineering", "postgres", "performance", "serverless"],
    featured: true,
    daysAgo: 5,
    coverPreset: "dusk",
    content: `Traditional Postgres access assumes a long-lived process: open a TCP socket, complete a TLS handshake, run the startup message, hold the connection open. That assumption is wrong on serverless, where your function may live for exactly one request.

The usual workaround is a pooler in front of the database. It works, but it hides a deeper question: **if every request is stateless, why are we maintaining session state at all?**

## The endpoint is just a URL

Neon exposes a SQL endpoint over HTTPS. A query is an HTTP POST:

\`\`\`
POST https://ep-example-123456.us-east-2.aws.neon.tech/sql
Neon-Connection-String: postgresql://…@ep-example-123456-pooler.us-east-2.aws.neon.tech/folio
Content-Type: application/json

{ "query": "select id, title from posts where status = $1 limit $2",
  "params": ["published", 10] }
\`\`\`

And the response is ordinary JSON:

\`\`\`json
{ "command": "SELECT",
  "fields": [{ "name": "id", "dataTypeID": 2950 }, { "name": "title", "dataTypeID": 25 }],
  "rows": [["a1f0…", "The Quiet Power of Typography-Driven Design"]],
  "rowCount": 1 }
\`\`\`

That is the whole protocol. Everything else that a Postgres client library does — connection strings, pools, prepared statement caches, type parsers, cursor emulation — exists to emulate the wire protocol *on top of* a stateless request.

Delete all of it and a query function is about a hundred lines:

\`\`\`ts
export async function query(text: string, params: SqlParam[] = []) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Neon-Connection-String": connectionString,
    },
    body: JSON.stringify({ query: text, params }),
    cache: "no-store",
  });
  const payload = await response.json();
  return { rows: payload.rows, rowCount: payload.rowCount };
}
\`\`\`

## What this actually costs and saves

Here is a cold start, measured over a hundred invocations of the same trivial \`select\`:

| Approach | Bundle added | p50 cold start | p99 |
| --- | --- | --- | --- |
| \`pg\` + pool | ~340 KB | 310 ms | 690 ms |
| ORM on top of \`pg\` | ~1.9 MB | 640 ms | 1.2 s |
| fetch driver (this) | ~4 KB | 41 ms | 96 ms |

The p99 column is where it matters. A pool that has gone cold pays TCP *and* TLS *and* Postgres authentication on the first request. An HTTPS request to a pooler pays one connection reuse on a box that is already warm, because the pooler is not yours — it is the database vendor's problem.

## The catch: no transactions across requests

Statelessness has teeth. Each request may land on a different pooled connection, so you cannot hold a transaction open across two HTTP calls.

The fix is to make writes single-statement. Data-modifying CTEs give you ordered, atomic multi-table writes in one round trip:

\`\`\`sql
with ins as (
  insert into claps (post_id, user_id, count)
  values ($1, $2, 1)
  on conflict (post_id, user_id)
    do update set count = least(claps.count + 1, 50)
  returning count
)
update posts
   set clap_count = clap_count + (select count from ins)
 where id = $1
returning clap_count;
\`\`\`

One statement, two tables, atomic, and the denormalised counter can never drift from the rows it counts.

## The rules I now follow

1. **Every write is one statement.** If it needs two, reach for a CTE before reaching for a transaction.
2. **Denormalise counters you read on every page.** One extra column is cheaper than a join plus an aggregate on the hot path.
3. **Cache at the edge, not in the process.** A serverless process is not a cache; it is a coincidence.
4. **No driver, no pool, no session.** The database is an API. Treat it like one.

The result is a publishing platform whose entire backend dependency list is \`next\` and \`react\`. Nothing to patch, nothing to configure, nothing to exhaust.`,
  },
  {
    author: "ada",
    slug: "in-praise-of-small-tools",
    title: "In Praise of Small Tools",
    subtitle:
      "The best software I own fits in my head. That is not a limitation of ambition — it is the feature.",
    tags: ["craft", "tools", "essay"],
    daysAgo: 9,
    coverPreset: "moss",
    content: `My grandfather had a workshop with forty tools in it. Each one did one thing. A plane, a brace, a set of chisels, a marking gauge. He could tell you the history of every one of them, and when he died the tools still worked.

I think about that workshop constantly when I look at modern software.

## The cost of a large tool

A large tool is not merely slower. It changes what you are willing to attempt.

When a framework takes two hours to configure, you stop prototyping in the evening. When a deploy takes twenty minutes, you batch three changes together and stop knowing which one broke. When a dependency tree is nine hundred packages deep, you stop reading the diff — and then you stop reading the code.

Interfaces shape ambition long before they limit capability. **A tool that is slow to pick up does not just delay the work; it deletes the projects you never start.**

## What small tools share

I have used enough of them now to notice the pattern. Small tools:

- **Do one thing at one level of abstraction.** A formatter formats. It does not also manage your dependencies.
- **Have no configuration for the common case.** Sensible defaults that you never once have to look up.
- **Produce output you can read.** Text, mostly. Things that \`grep\` understands.
- **Compose with the shell, the filesystem, and \`stdin\`.** The oldest interface in computing still works.
- **Fit on one screen of documentation.** If I need a tutorial to run it, it is a project, not a tool.

Only the last one is a matter of taste. The rest are engineering.

## The discomfort of the boring choice

Choosing a small tool makes you look unserious to people who equate complexity with rigour. This is the actual reason most teams adopt enormous dependencies: not capability, but legibility. Nobody was ever fired for adding a framework.

So the argument has to be made empirically. Count the bytes. Measure the cold start. Time the build. Delete the abstraction and see whether the error messages get better — they will, because there are fewer layers between you and the truth.

> Every abstraction is a loan against future understanding, and the interest compounds.

## A practice

Once a season, take one part of your system and ask what it would look like with nothing added. Not "how do I configure this better" — how would I write it if the framework, the library and the helper package did not exist?

Nine times out of ten the answer is forty lines of code you fully understand. The tenth time, the dependency earns its place, and now you know exactly why it is there.

My grandfather never owned a tool he could not sharpen. That is the whole standard.`,
  },
  {
    author: "ada",
    slug: "notes-on-writing-every-day-for-a-year",
    title: "Notes on Writing Every Day for a Year",
    subtitle:
      "Three hundred and sixty-five days, four hundred and twelve drafts, one clear conclusion: consistency is not a personality trait, it is a scheduling decision.",
    tags: ["writing", "habits", "craft"],
    daysAgo: 14,
    coverPreset: "clay",
    content: `A year ago I decided to publish one piece of writing every weekday. Not a book, not a newsletter strategy — just words, in public, on a schedule that could not be negotiated with. Here is what actually happened.

## The numbers

- 412 drafts started
- 261 pieces published
- 151 abandoned, most of them at the 200-word mark
- Median piece: 640 words
- Longest: 4,100 words, written over eleven days and published as one

## Consistency is a calendar problem

Everyone told me it was a discipline problem. It is not. The days I missed were never the days I lacked motivation; they were the days when the hour I had reserved was unavailable and no other hour had been reserved in its place.

So I stopped relying on willpower and started relying on a recurring block: 06:40 to 07:25, five days a week, at the same desk, with the same tea. The block does not care how I feel. **A scheduled block is a promise; motivation is a mood, and moods do not have a track record.**

## First drafts are supposed to be bad

The discovery that changed my year: I had been treating the first draft as a failure rather than a step. Once I accepted that a first draft is *supposed* to be thin, the cost of starting collapsed. I stopped trying to write well at 06:40 and started trying to write *at all* at 06:40, then editing at 16:00 when I had less enthusiasm and better judgement.

Editing is a different skill from writing and it wants a different mood. Separating them by eight hours was the single highest-leverage change I made.

## Publish before it is ready

The uncomfortable advice, and the correct one. A piece that lives in a drafts folder improves by maybe ten percent over a month. A piece that ships produces comments, arguments, corrections and follow-ups — and those improve the next piece by a hundred percent.

> Publishing is not the reward for finishing. It is the input to the next thing.

I built my drafts folder to support this: autosave as I type, a word count at the bottom, and a publish button that never asks me to confirm that I am sure. The friction I removed was entirely made of my own hesitation.

## What I would tell you to do

1. Pick a block, not a goal. "Tuesday and Thursday at seven" beats "three times a week."
2. Write badly on purpose, edit reluctantly, publish early.
3. Keep a file of ideas that are one sentence long. Two hundred of them will carry you through the year.
4. Never publish twice in the same day to make up for a missed day. The schedule is the point.

The year did not make me a better writer by magic. It made me a writer by arithmetic.`,
  },
  {
    author: "nour",
    slug: "how-i-built-a-reading-habit-that-stuck",
    title: "How I Built a Reading Habit That Stuck",
    subtitle:
      "Six failed attempts, one that worked. The difference was entirely about removing friction, not adding discipline.",
    tags: ["reading", "habits"],
    daysAgo: 21,
    coverPreset: "sand",
    content: `I have attempted a daily reading habit six times. Five attempts died within a fortnight. The sixth is in its third year, and I think I finally understand why.

## The failed attempts all shared a mistake

Each one started with a target: twenty pages a day, a book a week, fifty books a year. Every target turned reading into a task with a score. And anything with a score can be lost — which means every slow evening became evidence of failure rather than a pleasant hour.

Targets also fail arithmetically. Miss three days and the deficit becomes so large that recovering it is worse than abandoning it.

## What worked

Two rules, neither of which is about quantity:

**Books are in two places and nowhere else.** One on my bedside table, one in my bag. If I want to read, a book is within arm's reach, always. There is no decision to make and no shelf to browse.

**Reading happens in the gaps I already had.** Not a scheduled hour — those never survive contact with a real week. Instead: the queue, the kettle, the ten minutes before a meeting starts. Gaps are abundant, unclaimed, and impossible to fail at.

A habit that occupies an existing gap costs no willpower, because you were already waiting.

## The tracking that helped

I do track reading, but I track the *wrong* things on purpose: which pieces I finished, not how many. A list of titles with a date next to each. Two hundred entries in three years, and looking at it is genuinely motivating in a way a page count never was.

Folio's reading history does the same job quietly — it remembers where I stopped and how far in I got, and it never once scolds me for a gap. That absence of judgement turns out to be the feature.

> A habit is not something you do every day. It is something you return to without ceremony.

## The test

If your reading habit needs a scheduled hour, a page target, and a streak to survive, it will not. If it needs a book within reach and a gap you already had, it will outlast your enthusiasm.

That is all. It took me six attempts to learn something that fits in a sentence.`,
  },
  {
    author: "jun",
    slug: "a-field-guide-to-slow-software",
    title: "A Field Guide to Slow Software",
    subtitle:
      "Fast software is not software that responds quickly. It is software that does not waste the one resource your users cannot renew.",
    tags: ["engineering", "craft", "performance"],
    daysAgo: 27,
    coverPreset: "indigo",
    content: `Performance work is usually framed as a latency budget: make the number smaller. But the numbers that matter are rarely the ones on the dashboard, because the expensive latency is the latency you cannot measure — the seconds your users spend waiting for something that should have been instant, over and over, until they develop a low-grade contempt for your product.

## The taxonomy

After enough profiling sessions you start to see the same five species of slowness.

**1. Slowness by architecture.** The data lives three network hops away and every render fetches it again. Fixing this is not optimisation, it is surgery: move the data closer, cache the result, or render it at build time.

**2. Slowness by default.** A framework ships a sensible default that is wrong for your case — client-side rendering for a page with no interactivity, a watcher polling twice a second, a dev server compiling your whole app to serve one document. Defaults are somebody else's tradeoff.

**3. Slowness by accumulation.** Nothing here is slow in isolation. There are just four hundred things, each adding three milliseconds, and no single commit that made it bad. This is the species that kills mature products, because it is nobody's fault and therefore nobody's job.

**4. Slowness by ceremony.** A spinner for an operation that takes nine milliseconds. A confirmation dialog for a reversible action. A loading skeleton that appears and disappears so fast it reads as a flicker. Perceived performance is a design responsibility, not an infrastructure one.

**5. Slowness by indifference.** The honest one. Somebody knew, and the roadmap said no.

## Diagnosing

You cannot fix what you have not felt. So: open your product on the worst device you support, on the slowest connection you can simulate, with the cache cold. Do it every week. Instrument the p99 and then *use* the p99 — a p50 of 40 ms means nothing when one user in a hundred waits four seconds.

Then read the network tab like a detective. Every request is a decision somebody made, and most of them can be removed.

> The fastest request is the one you delete. The second fastest is the one you serve from a cache you forgot you had.

## The slow-software checklist

- Does this page need JavaScript at all?
- Can this be rendered before the user asks for it?
- Is this fetched once, or once per component that needs it?
- Does this query run on every request, or on every *change*?
- Is this animation making the wait feel shorter, or merely drawing attention to it?
- If I removed this feature entirely, would anyone notice?

That last question is unpleasant and extremely productive. About a third of what feels slow is not slow code at all — it is a feature that should not exist.

## Where it ends

Slow software is usually not a performance problem. It is evidence that nobody was responsible for the experience as a whole, only for their own part of it.

Speed is not a number you hit once. It is a habit of noticing, held by people with the authority to delete things. Give a team that habit and a licence to remove code, and speed arrives as a side effect.`,
  },
  {
    author: "nour",
    slug: "the-best-interface-is-a-sentence",
    title: "The Best Interface Is a Sentence",
    subtitle: "Most products do not need a dashboard. They need to tell you one true thing, clearly, once.",
    tags: ["design", "writing", "essay"],
    daysAgo: 34,
    coverPreset: "dusk",
    content: `There is a moment in every design review when somebody says "we could show this as a chart." It is almost always the wrong answer.

A dashboard asks the reader to do work: find the axis, compare the bars, remember last month's shape, decide what it means. A sentence does that work for them:

> Your essays read 12% further this month than last.

Eight words. One comparison, already made. One conclusion, already reached. The reader now has an opinion, which is what they came for.

## Charts are for patterns across many points

Charts earn their space when there are more data points than a person can hold in their head: a hundred days of traffic, ten thousand users, the distribution of reading time across a whole publication. Below that threshold, a chart is decoration wearing the costume of rigour.

Two numbers compared to each other is not a chart. It is a sentence with a rectangle in the middle.

## What makes a good interface sentence

Four properties, in order of importance:

1. **It contains the comparison.** Not "1,240 views" but "1,240 views, up 18% from last week."
2. **It is specific.** "Twelve people finished your latest piece" beats "Good engagement this week."
3. **It is written in the reader's vocabulary.** No "sessions," no "MAU," no "conversion events."
4. **It is one sentence.** If it needs a semicolon, split it into two sentences and show only the important one.

> Write the sentence first. If you cannot write the sentence, you do not yet know what the data means — and neither will your users.

## Where this leads

Applied honestly, this principle makes interfaces much smaller. Half the panels disappear. Four of six metrics turn out to be noise the sentence already accounted for. What remains is a page a person can read in eight seconds and act on.

The dashboard was never the goal. Being understood was the goal.`,
  },
];

export const COMMENTS = [
  {
    postSlug: "postgres-over-http-zero-cold-starts",
    author: "ada",
    body: "The table of cold starts is the part everyone skips. A 640 ms ORM cold start is invisible on a fast machine with a warm pool and brutal on the first visitor of the day.",
  },
  {
    postSlug: "postgres-over-http-zero-cold-starts",
    author: "nour",
    body: "Reading this as a designer, the sentence that landed was 'the database is an API.' It explains why our backend feels lighter than it used to — most of what we removed was session state nobody asked for.",
  },
  {
    postSlug: "postgres-over-http-zero-cold-starts",
    author: "reader",
    body: "Tried the CTE trick for a counters table this week after reading this. One round trip instead of three, and the numbers stopped drifting.",
    parentIndex: 0,
  },
  {
    postSlug: "the-quiet-power-of-typography-driven-design",
    author: "jun",
    body: "'Mixing more than two families is a symptom of not having decided' is going on a wall. Thank you.",
  },
  {
    postSlug: "the-quiet-power-of-typography-driven-design",
    author: "ada",
    body: "The 45–75 character measure is the one rule I break deliberately when writing dialogue. Everything else holds up beautifully.",
  },
  {
    postSlug: "in-praise-of-small-tools",
    author: "jun",
    body: "The loan-and-interest framing is exactly right. I have spent a week this year debugging a dependency I could have written in an afternoon.",
  },
  {
    postSlug: "notes-on-writing-every-day-for-a-year",
    author: "nour",
    body: "Separating drafting from editing by eight hours is the tip I have already stolen. My first drafts got longer and my edits got shorter in the same week.",
  },
  {
    postSlug: "a-field-guide-to-slow-software",
    author: "ada",
    body: "'You cannot fix what you have not felt' — I keep a cheap Android phone on my desk for exactly this reason, and it has caught more regressions than any dashboard.",
  },
  {
    postSlug: "a-field-guide-to-slow-software",
    author: "nour",
    body: "Slowness by ceremony gets so little attention. Half the spinners I have designed were apologies for a decision I made earlier.",
    parentIndex: 0,
  },
];

export const DRAFTS = [
  {
    author: "ada",
    slug: "on-editing-your-own-work",
    title: "On Editing Your Own Work",
    subtitle: "A working method for cutting ten percent without losing the voice.",
    tags: ["writing", "craft"],
    content: `Draft in progress.

The rule I keep returning to: cut the sentence that explains the sentence before it. Most first drafts are a good idea followed by an apology for the good idea.

## To work through

- Reading aloud as a cut mechanism
- The specific case of the first paragraph (usually the last thing written)
- Why "very" and "really" are not emphasis but hesitation
`,
  },
  {
    author: "jun",
    slug: "serverless-postgres-one-year-later",
    title: "Serverless Postgres, One Year Later",
    subtitle: "What held up, what did not, and the three places I still want a real connection.",
    tags: ["engineering", "postgres", "serverless"],
    content: `Notes toward a retrospective.

**Held up:** HTTP queries, denormalised counters, single-statement writes, zero-dependency drivers.

**Did not:** bulk imports over HTTP (batch them), anything needing a server-side cursor, and long-running analytical scans.

**Still want a connection:** migrations, the seed script, and one nightly aggregate job.
`,
  },
];
