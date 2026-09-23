# Folio

A typography-first publishing platform: write in Markdown, publish instantly, and read without
pop-ups, paywalls or a recommendation algorithm.

Built to be deployed on **Vercel + Neon Serverless Postgres** with no ORM, no Postgres client and no
auth library. The whole dependency list is Next.js, React, Framer Motion, Tailwind's merge helpers,
and eight Radix UI primitives.

---

## What's in it

**Reading**

- A feed with three orderings (latest, trending, most discussed) and tag filtering
- Instant search across titles, subtitles and excerpts
- A distraction-free article view: adjustable measure, text size and typeface, a reading-progress
  bar, and an outline of headings
- Claps, threaded comments, bookmarks and follows

**Writing**

- A Markdown editor with live preview, autosave, keyboard shortcuts (⌘S / ⌘⏎) and crash recovery —
  if the tab dies mid-draft, the editor offers to restore what you typed
- Cover presets, tags, and a profile picture cropped to 256×256 in the browser (no object storage)
- Publish, unpublish, edit and delete, with ownership enforced in SQL

**Creator analytics**

- Reader sessions, attention over time, completion rates and referrers, aggregated in Postgres by
  a reader heartbeat

---

## Quick start

Requires Node 20.9 or newer. **You do not need to install Postgres** — the project ships a
Postgres-compatible sidecar (PGlite) that speaks Neon's HTTP protocol, so development uses the
same driver and the same queries as production.

```bash
npm install

npm run dev:db     # terminal 1 — local database on :5433 (creates + migrates itself)
npm run db:seed    # once — demo authors, essays, comments and analytics
npm run dev        # terminal 2 — the app on http://localhost:3000
```

Sign in with **`demo@folio.dev`** / **`folio-demo`**.

---
---

# Deploy to Vercel + Neon

Three things have to exist before the first deploy: a Neon database, its connection string in
Vercel's environment variables, and the Folio tables inside it. The steps below do them in that
order. **Total time: about ten minutes.**

> **Why the order matters:** the build renders real pages, which means it queries the database. If
> the environment variables are missing the build **fails on purpose** (rather than deploying a site
> that 500s for every visitor), and if the tables do not exist yet the build succeeds but ships an
> empty site.

## Step 1 — Create the Neon database

1. Sign up at **[neon.com](https://neon.com)** (free tier is plenty) and verify your email.
2. **Create a project.** Name it `folio`. Pick the region closest to you — for India, Singapore
   (`ap-southeast-1`) is usually the fastest. Vercel's own default region has historically been
   Washington D.C. (`iad1`); matching your Vercel region keeps app-to-database latency low, and you
   can set that region in Vercel under **Project → Settings → Functions**.
3. Neon creates a database and a role for you and drops you on the **Connect** panel.
4. Make sure **Connection pooling** is **on** — the hostname then contains `-pooler`. This is the
   right choice for serverless: the pooler terminates connections on Neon's side so functions
   cannot exhaust Postgres.
5. Copy the **connection string**. It looks like this (not a real password):

   ```
   postgresql://neondb_owner:npg_AbCdEf123456@ep-cool-name-a1b2c3d4-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

   Treat it as a password — it grants full access to your database.
6. Keep it somewhere safe for the next two steps. You can always come back to **Connect** to copy it
   again.

> Folio derives the SQL-over-HTTP endpoint from this one string by swapping the first hostname label
> for `api.` — the exact transform `@neondatabase/serverless` uses:
> `ep-cool-name-…-pooler.ap-southeast-1.aws.neon.tech` → `https://api.ap-southeast-1.aws.neon.tech/sql`.
> You don't have to configure anything, and pooled vs. direct both work; pooling is decided by the
> string itself, not the URL.

## Step 2 — Create the tables

Run this from the project on your computer. It applies `src/db/schema.sql` — ten tables, indexes and
a few generated columns — and it is **idempotent**, so running it twice is harmless.

```bash
npm install

DATABASE_URL="<paste your Neon connection string here>" npm run db:push
```

**Windows PowerShell** uses different syntax for the inline variable:

```powershell
$env:DATABASE_URL="<paste your Neon connection string here>"; npm run db:push
```

The first two lines of output are your sanity check — they show where the script is about to connect
and which endpoint it derived. They should read:

```
target   postgresql://neondb_owner:•••@ep-cool-name-…-pooler.ap-southeast-1.aws.neon.tech/neondb
endpoint https://api.ap-southeast-1.aws.neon.tech/sql
```

A successful run ends with a table list and `✓ 34 statements applied`. If it fails, jump to
**Troubleshooting** below — the error message names the exact problem.

**Optional — demo content.** To start with seven readable essays, four authors and analytics
instead of an empty site:

```bash
DATABASE_URL="<your Neon connection string>" npm run db:seed
```

This also creates the `demo@folio.dev` / `folio-demo` account. Delete those rows (or just never
sign in as them) before you invite real readers.

## Step 3 — Push the code to GitHub

If you are working from a clone of this repository, your branch is already on GitHub. If you want it
in your own account instead:

1. Create an empty repository at **[github.com/new](https://github.com/new)** — private is fine.
   Don't add a README or a `.gitignore`; this project has both.
2. Then, in the project directory:

   ```bash
   git remote set-url origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

`.env.local` and the local database directory are gitignored, so **your Neon password is not in the
repository** — only `.env.example`, which has placeholder values.

## Step 4 — Deploy on Vercel

1. Sign up at **[vercel.com](https://vercel.com)** using your GitHub account (that is what makes the
   next step a one-click import).
2. Click **Add New… → Project**, find your repository, and click **Import**.
3. Vercel detects Next.js on its own. **Do not change** the build command, output directory or
   install command.
4. Open **Environment Variables** and add exactly three:

   | Name | Value | Notes |
   | --- | --- | --- |
   | `DATABASE_URL` | your Neon connection string | The pooled one, pasted **inside double quotes** — it contains `?` and `&`, which some shells and tools treat specially. |
   | `FOLIO_SESSION_SECRET` | a long random string | Signs session cookies. Generate one with the command below. |
   | `NEXT_PUBLIC_SITE_URL` | `https://your-project.vercel.app` | Used for canonical links, Open Graph tags, `sitemap.xml` and `robots.txt`. |

   Generate the session secret:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

   Leave all three applied to **Production, Preview and Development** so preview deploys work too.

5. Click **Deploy**. The first build takes a minute or two: it compiles, then pre-renders the feed,
   the most recent stories and the author profiles as static HTML and caches the rest.

6. You'll get a URL like `https://folio-yourname.vercel.app`. Open it.

## Step 5 — Verify

Paste this into your browser: **`https://your-project.vercel.app/api/health`**

```json
{ "ok": true, "database": "reachable", "latencyMs": 41, "posts": 7, "authors": 4, … }
```

`ok: true` means the deployed function reached Neon over HTTPS and read your tables. If `posts` is
`0`, the database is simply empty — publish something, or re-run `db:seed` from Step 2 and reload.

To check the whole site the way the test suite does, point it at the deployment:

```bash
SMOKE_BASE_URL=https://your-project.vercel.app npm run smoke
```

That exercises 75 things end to end — page rendering, caching headers, sign-in, publishing,
unpublishing, claps, comments, bookmarks and the analytics heartbeat. It signs in with the demo
account, so it needs `db:seed` to have been run.

## Step 6 — A real domain (optional)

1. In Vercel: **Project → Settings → Domains → Add**, then follow the DNS instructions for your
   registrar.
2. **Change `NEXT_PUBLIC_SITE_URL`** to the new address and **redeploy**. This value is baked into
   the build (it is `NEXT_PUBLIC_*`), so editing the variable alone changes nothing until a new
   deployment runs.

The domain usually works within a few minutes; the certificate is issued automatically.

---

## Changing things later

| I want to… | Do this |
| --- | --- |
| Deploy a code change | Push to the branch Vercel watches — it builds and deploys automatically. |
| Change an environment variable | Edit it in Vercel, then **redeploy**. Vercel rebuilds; it does not hot-swap values into a running deployment. |
| Change the database schema | Edit `src/db/schema.sql`, then run `db:push` against your Neon URL. Keep every statement idempotent. |
| Move to a different Neon branch | Point `DATABASE_URL` at the new branch's pooled string, redeploy, and run `db:push` against it once. |
| Delete the demo content | `delete from posts where author_id in (select id from users where email like '%@folio.dev');` then `delete from users where email like '%@folio.dev';` in Neon's SQL Editor. |

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Deploy fails: `DATABASE_URL is not set` | The variable is missing in Vercel, or was only added to one environment | Add it for Production **and** Preview, then redeploy. |
| Any page returns 500 | The tables don't exist in the database Vercel is pointed at | Run Step 2 against that exact Neon URL. `/api/health` will tell you whether the connection works. |
| `password authentication failed` | The connection string is stale or was hand-edited | Copy it fresh from Neon's **Connect** panel and update `DATABASE_URL`. |
| `getaddrinfo ENOTFOUND` / DNS error | The hostname was mistyped or truncated when pasting | Re-paste the whole string, including `?sslmode=require`. |
| TLS or certificate errors | A `DATABASE_HTTP_ENDPOINT` override is set to something wrong | Remove that variable — Folio derives the endpoint automatically. |
| `db:push` says `42P01 relation "posts" does not exist` | You skipped Step 2 (the schema) | Run `npm run db:push`, then redeploy. |
| Site is up but empty | The database has no posts | Publish a story, or run `db:seed`, then reload. |
| Everyone is signed out after a deploy | `FOLIO_SESSION_SECRET` changed | Expected — old cookies no longer verify. Sign in again. |
| The home page looks stale after publishing | ISR caches the feed for 60 seconds | Publishing from the app invalidates it immediately; a direct database edit can take up to a minute. |

Work through it locally first when you can: errors from `npm run dev` and `npm run db:push` are far
more readable than the minified ones in Vercel's build log.

---

## Environment variables

| Variable | Required | What it does |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. Local dev uses the bundled sidecar; production uses Neon's pooled host. |
| `FOLIO_SESSION_SECRET` | yes | 32+ random bytes used to sign session cookies. Rotating it signs everyone out. |
| `NEXT_PUBLIC_SITE_URL` | recommended | Public base URL for canonical links, Open Graph, `sitemap.xml` and `robots.txt`. Defaults to `http://localhost:3000`. |
| `DATABASE_HTTP_ENDPOINT` | no | Override for the SQL-over-HTTP endpoint. Only needed for a Neon-compatible gateway that serves `/sql` on the database host itself. |

Copy `.env.example` to `.env.local` for local work. `.env.local` is gitignored.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on `0.0.0.0:3000`. |
| `npm run dev:db` | Local Postgres (PGlite) on `:5433`, speaking Neon's HTTP protocol. Data lives in `.data/folio`. |
| `npm run build` | Production build. Pre-renders the static pages, so it needs `DATABASE_URL`. |
| `npm start` | Serve the production build locally. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run db:push` | Apply `src/db/schema.sql` to `DATABASE_URL`. Idempotent. `--reset` drops Folio's tables first. |
| `npm run db:seed` | Demo authors, essays, comments, bookmarks and analytics. Only touches `@folio.dev` accounts. |
| `npm run smoke` | 75 end-to-end checks against a running server. `SMOKE_BASE_URL=https://…` to test a deployment. |

---

## How it's built

**No ORM.** Queries are tagged template literals over a small driver, so the SQL is the source of
truth and the bundle contains no query builder:

```ts
const posts = await many<PostCard>(sql`
  select ${POST_CARD_COLUMNS} from posts p join users u on u.id = p.author_id
   where p.status = 'published' order by p.published_at desc limit ${limit}
`);
```

**No Postgres client.** Neon serves SQL over plain HTTPS — `POST https://<region-api-host>/sql` with
the connection string in a header. `src/db/driver.ts` is that protocol in about 120 lines, using only
native `fetch`, with one retry for gateway errors and a query timeout. Nothing to pool locally, no
TCP handshake, no cold-start of a connection manager. The local sidecar implements the same protocol,
so development and production run the *same* code path.

**No auth library.** Passwords use PBKDF2-SHA256 at 210,000 iterations via `crypto.subtle`; sessions
are an HMAC-signed token in an `httpOnly`, `sameSite=lax` cookie, backed by a `sessions` row so they
can be revoked. Sign-in runs the hash comparison even when the account doesn't exist, so a wrong
username and a wrong password take the same time.

**Two layers of caching.** Route-level ISR serves the feed and articles from Vercel's CDN — a hit
costs zero function invocations and zero database round trips. Under it, `unstable_cache` caches
query results for the pages that must read `searchParams` (search, filtered feeds). Every entry is
tagged, and a write invalidates exactly what it touched from the same Server Action that performed
it.

**Viewer-agnostic pages.** Cacheable pages never read cookies or headers. Personal state — *did I clap
this? did I save it?* — arrives in a small client island afterwards, or on a dynamic route
(`/dashboard`, `/library`). That is what lets an article be static and personal at the same time.

**Markdown on the server only.** `lib/markdown.ts` escapes first, then formats, so the result is safe
to inject by construction — and no parser or sanitiser is ever shipped to the browser. The live
preview asks the server to render it, using the same function.

**Writes are single statements.** Neon's HTTP endpoint is stateless and cannot hold a transaction, so
multi-table mutations are one statement with data-modifying CTEs. Counters (claps, comments, views)
are denormalised columns updated in place, with a `recompute` pass to reconcile them.

## Project structure

```
src/
  app/                    routes — feed, article, explore, search, profiles, dashboard, editor,
                          library, auth, API handlers, sitemap, robots
  components/             UI kit, article reader, editor, dashboard, motion wrappers
  db/                     driver, SQL tag, schema.sql, queries, cache wrappers
  lib/                    auth (password/tokens/session), markdown, validation, rate limiting
  server/actions/         Server Actions: auth, posts, social, username checks
scripts/                  local Postgres sidecar, db:push, db:seed, end-to-end smoke test
```

## Security notes

- Session cookies are `httpOnly`, `sameSite=lax`, and carry `secure` when `NODE_ENV=production`
  (which is what Vercel builds as), so they are never sent over plain HTTP.
- Every mutation re-checks ownership in SQL rather than trusting the client.
- Rate limits: registration 5/15min, sign-in 8/5min, comments 12/5min, claps 120/min, per user or IP.
- Analytics identify a reader by `sha256(ip + user agent + user id + secret)` — a rotating
  per-site identifier, never the raw address.
- Avatars are cropped and scaled in the browser and stored as data URIs, so there is no file upload
  endpoint and no object storage to secure.

## License

MIT for the application code. The bundled fonts in `src/app/fonts/` are Inter and Playfair Display
under the SIL Open Font License 1.1 — see `src/app/fonts/README.md`.
