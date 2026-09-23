# Folio

A publishing platform built to load fast, read beautifully, and cost nothing to
run. Next.js 16 App Router, raw SQL over the Neon serverless driver, hand-rolled
auth on Web Crypto, and a zero-dependency analytics chart.

- **No ORM.** Every query is a template string of real SQL.
- **No auth library.** PBKDF2 via `crypto.subtle`, HMAC-signed HTTP-only cookies.
- **No Postgres required to try it.** Without a `DATABASE_URL` the identical SQL
  runs against a built-in in-memory engine, pre-loaded with demo content.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

That is the whole setup. No `.env`, no database. The in-memory engine seeds
itself with four authors and seven articles.

**Demo account:** `ada@folio.test` / `folio-demo`

To publish your own writing, add a Neon database (below) — or keep going on the
in-memory engine and note that its data resets when the server restarts.

## With Neon

```bash
cp .env.example .env.local     # paste your pooled connection string + AUTH_SECRET
npm run db:push                # applies db/schema.sql
npm run db:seed                # optional: loads the same demo content
```

On Vercel, set `DATABASE_URL` and `AUTH_SECRET` under Project → Settings →
Environment Variables. Use the **pooled** (`-pooler`) host so serverless
functions share connections instead of exhausting direct ones.

---

## How it is put together

```
app/
  layout.tsx                 Root shell: fonts, theme script, header/footer
  page.tsx                   Feed — following / trending / new
  page.tsx (dynamic)         /search, /saved, /settings, /write, /dashboard/**
  p/[slug]/page.tsx          The reading view (ISR, 60s)
  [username]/page.tsx        Public author profile (ISR, 120s)
  tags/page.tsx              Tag index (ISR, 300s)  ·  tags/[tag] (ISR, 120s)
  (auth)/login|register      Server Action forms
  api/
    me/                      Session bootstrap for the header
    posts/[slug]/state/      Reader-specific counters (dynamic, no-store)
    posts/[slug]/clap|bookmark|comments/
    track/                   View beacon → 43-byte GIF
    auth/logout/
  icon.svg · opengraph-image.tsx

lib/
  db/
    index.ts                 The only DB import surface: query / transaction
    engine.ts                Neon HTTP driver  ⇄  in-memory engine
    memory.ts                SQL-subset engine used when there is no DATABASE_URL
    seed-data.ts             Demo corpus (shared by both engines)
    queries/                 posts, users, sessions, engage, stats
  auth/                      crypto · password · secret · token · session · validators
  utils/                     markdown · slug · format · rate-limit · editor-commands
  actions/                   auth · posts · profile  (Server Actions)

components/
  editor.tsx                 Markdown editor with autosaving drafts
  reading-toolbar.tsx        Width / type size / serif toggle for readers
  sparkline.tsx              Hand-drawn SVG — no chart library in the bundle
  ui/                        button · field · badge · avatar · card

db/schema.sql                The entire data model, idempotent
proxy.ts                     Signed-cookie route guard
scripts/db-push.ts           Applies the schema to Neon
scripts/db-seed.ts           Loads demo content into Neon
tests/                       node:test suites (markdown, auth, db, editor)
```

## Rendering strategy

| Route | Strategy | Why |
|---|---|---|
| `/p/[slug]` | ISR, 60s | A story is read far more often than it changes |
| `/[username]`, `/tags/[tag]` | ISR, 120s | Author pages change slowly |
| `/tags` | ISR, 300s | Tag index barely moves |
| `/`, `/search` | Dynamic | Personalised, or driven by a query string |
| `/saved`, `/dashboard/**`, `/settings` | Dynamic, cookie-guarded | Per-reader |
| `/api/track` | Dynamic, no-store | A write |

Claps, bookmarks and comments run through route handlers that mutate the
database and then `revalidatePath`, so the next reader sees fresh counters.

## Decisions worth knowing

**One SQL surface, two engines.** `lib/db/index.ts` exposes `query`,
`queryOne`, `queryValue` and `transaction`. With `DATABASE_URL` set they go to
Neon over HTTP; without it, the same SQL text is parsed by
`lib/db/memory.ts`. Nothing in `lib/db/queries` knows which one it is talking
to, so the app runs end to end with no infrastructure and the test suite covers
real SQL rather than a mock API.

**Counters live in one place.** `clap_count` and `comment_count` are updated
only inside transactions in `lib/db/queries/engage.ts`. There is exactly one
trigger in the schema, and it maintains `updated_at` — duplicate-maintained
counters drift, so nothing else writes them.

**Views de-duplicate by design.** `post_views` carries
`unique (post_id, viewer_key, day)`, so `insert … on conflict do nothing
returning id` doubles as a "is this a new view?" probe. A reload is not a view.

**Analytics are server-rendered.** `components/sparkline.tsx` draws an SVG path
from the 30-day series. No chart library, no client JS, no layout shift.

**Auth.** Passwords are PBKDF2-SHA256 at 210k iterations with a per-user salt.
The cookie holds `token.HMAC-SHA256(AUTH_SECRET, token)`; `proxy.ts` verifies
that HMAC in constant time and never touches the database, while `sessions`
stores only `sha256(token)` — a database leak yields nothing usable.

**Markdown, not HTML.** The editor stores Markdown; `lib/utils/markdown.ts`
escapes first and emits a safe subset, with no sanitizer dependency. Links are
restricted to `http`, `https`, `mailto` and relative paths.

**Fonts are self-hosted** from `@fontsource-variable` — Google Fonts is not in
the request path, and there is no layout shift or third-party cookie.

## Scripts

```bash
npm run dev        # next dev
npm run build      # next build (also typechecks)
npm run start      # next start
npm test           # node:test suites via tsx
npm run db:push    # apply db/schema.sql to Neon
npm run db:seed    # load demo content into Neon
```

## Requirements

Node 20.9 or newer. `DATABASE_URL` and `AUTH_SECRET` are optional in
development and required in production.
