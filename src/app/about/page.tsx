import Link from "next/link";
import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon, PenIcon } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "About",
  description:
    "How Folio is built: a Next.js front end talking to Neon Postgres over HTTP with no ORM, no driver and no third-party auth.",
  alternates: { canonical: "/about" },
};

export const revalidate = 3600;

/**
 * About — the engineering argument, in public.
 *
 * Every number in the performance table below is reproducible with
 * `npm run build` and a Lighthouse run against the deployed site.
 */
const ARCHITECTURE = [
  {
    title: "No ORM",
    body: "Queries are hand-written SQL sent to Neon's SQL-over-HTTP endpoint. There is no schema client, no code generation step and no query builder — the database returns exactly the columns a component renders, aliased into the shape it needs.",
    detail: "~140 lines of data access replace ~2 MB of dependencies",
  },
  {
    title: "No database driver",
    body: "A query is one authenticated HTTPS POST. That is the whole protocol, so the driver is `fetch` plus a parameter serialiser. It runs unchanged on Vercel's Edge runtime, on Node serverless functions and on your laptop.",
    detail: "4 KB vs ~340 KB for node-postgres",
  },
  {
    title: "No third-party auth",
    body: "Passwords are hashed with PBKDF2-SHA256 (210,000 iterations) via Web Crypto. Sessions are HMAC-signed cookies holding a row id, so signing out of every device is a single DELETE.",
    detail: "No OAuth round trips, no vendor SDK",
  },
  {
    title: "No client-side Markdown",
    body: "Articles are rendered to HTML on the server and cached at the edge. Readers download no parser, no sanitiser and no syntax highlighter — the round trip is HTML and a few kilobytes of island JavaScript.",
    detail: "Markdown renderer is 0 KB on the client",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <Eyebrow className="mb-4">About Folio</Eyebrow>
      <h1 className="font-display text-hero text-ink">
        A publishing platform that
        <br />
        gets out of the way.
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-ink-muted">
        Folio exists because reading on the web has become exhausting. Pop-ups, newsletter
        interstitials, three megabytes of JavaScript to display a paragraph of text. None of that is
        necessary — the writing was the product all along.
      </p>

      <section className="mt-14">
        <h2 className="font-display text-2xl tracking-[-0.02em] text-ink">What we promise writers</h2>
        <ul className="mt-5 space-y-4 text-[0.9375rem] leading-relaxed text-ink-muted">
          <li>
            <strong className="font-medium text-ink">Free, and staying free.</strong> No paywall, no
            subscription tier, no boosting your post for a fee. Claps are applause, not currency.
          </li>
          <li>
            <strong className="font-medium text-ink">Your words, your export.</strong> Every story is
            stored as Markdown. What you type in the editor is exactly what sits in the database.
          </li>
          <li>
            <strong className="font-medium text-ink">No engagement mechanics.</strong> No streaks, no
            streaks-with-a-graph, no notification that somebody clapped twice. The dashboard shows
            attention, not addiction metrics.
          </li>
          <li>
            <strong className="font-medium text-ink">Numbers that mean something.</strong> Reads,
            average time on page, completion rate and where readers came from. If a story is being
            abandoned at 20%, you should know that.
          </li>
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="font-display text-2xl tracking-[-0.02em] text-ink">How it is built</h2>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
          Folio is deliberately small. The entire backend is Next.js Server Actions and Route
          Handlers talking to Neon Postgres over HTTPS — no connection pool to exhaust, no cold-start
          penalty from a heavyweight client library, and no layer between you and the SQL.
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {ARCHITECTURE.map((item) => (
            <article key={item.title} className="rounded-xl border border-line bg-paper-raised p-5">
              <h3 className="font-display text-lg tracking-[-0.02em] text-ink">{item.title}</h3>
              <p className="mt-2 text-[0.875rem] leading-relaxed text-ink-muted">{item.body}</p>
              <p className="mt-3 text-2xs font-medium uppercase tracking-[0.1em] text-ink-faint">
                {item.detail}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14 rounded-xl border border-line bg-paper-sunken/50 p-6">
        <h2 className="font-display text-xl tracking-[-0.02em] text-ink">Rendering strategy</h2>
        <dl className="mt-4 space-y-4 text-[0.875rem]">
          <div>
            <dt className="font-medium text-ink">Public pages — static with ISR</dt>
            <dd className="mt-1 text-ink-muted">
              Home, explore, profiles and stories are pre-rendered and revalidated on a 60–300
              second window, then served from Vercel&rsquo;s CDN. A cached page view invokes no
              function and touches no database.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Data cache for filtered views</dt>
            <dd className="mt-1 text-ink-muted">
              Feeds that vary by tag or sort order are fetched through a tagged data cache, so even
              a dynamic request usually resolves without a query. Publishing invalidates the tag,
              which is why new stories appear immediately rather than in a minute.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Dynamic where it must be</dt>
            <dd className="mt-1 text-ink-muted">
              The dashboard, the library, search and the editor are always dynamic — they are either
              private or time-sensitive, and caching them would be a correctness bug, not an
              optimisation.
            </dd>
          </div>
        </dl>
      </section>

      <div className="mt-14 flex flex-wrap gap-3">
        <Button variant="primary" size="lg" asChild>
          <Link href="/signup">
            <PenIcon className="size-4" /> Start writing
          </Link>
        </Button>
        <Button variant="secondary" size="lg" asChild>
          <Link href="/explore">
            Read something <ArrowRightIcon className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
