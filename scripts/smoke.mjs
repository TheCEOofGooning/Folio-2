/**
 * `npm run smoke` — end-to-end check of a running Folio server.
 *
 * This is not a unit test suite. Folio is mostly server components, raw SQL and
 * Server Actions, so the interesting failures live in the seams: a query that
 * returns the wrong shape, an action whose auth gate broke, a page that stopped
 * being cached. The script therefore drives the **real HTTP surface**, including
 * the Server Actions themselves — it reads the action ids out of
 * `.next/server/server-reference-manifest.json` and posts to them with the
 * `Next-Action` header, which is byte-for-byte what the browser's RSC client does.
 *
 * Usage:
 *   npm run build && npm run start        # in one terminal
 *   npm run smoke                         # in another
 *
 *   SMOKE_BASE_URL=https://folio.example npm run smoke
 *
 * It creates one draft, publishes it, exercises claps/comments/bookmarks/follows
 * against it, then unpublishes and deletes it — so the only residue is a handful
 * of counters on the demo database.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveEndpoint } from "./neon-http.mjs";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_EMAIL = process.env.SMOKE_EMAIL ?? "demo@folio.dev";
const DEMO_PASSWORD = process.env.SMOKE_PASSWORD ?? "folio-demo";

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ${c.green("✓")} ${label}${detail ? ` ${c.dim(detail)}` : ""}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  ${c.red("✗")} ${label}${detail ? ` ${c.dim(detail)}` : ""}`);
  }
}

function section(title) {
  console.log(`\n  ${c.bold(title)}`);
}

// ── Server Action transport ──────────────────────────────────────────────────
// The manifest maps action id → { filename, exportedName, workers }. `workers`
// tells us which routes may invoke it, so we address each action at a page that
// actually declares it.

let manifest = null;
try {
  manifest = JSON.parse(readFileSync(join(ROOT, ".next/server/server-reference-manifest.json"), "utf8"));
} catch {
  console.error(
    `\n  ${c.red("Could not read .next/server/server-reference-manifest.json")}\n` +
      `  Build the app first: ${c.bold("npm run build")}\n`,
  );
  process.exit(2);
}

const actions = new Map();
for (const [id, entry] of Object.entries(manifest.node ?? {})) {
  if (!entry?.filename?.startsWith("src/server/actions/")) continue;
  actions.set(entry.exportedName, { id, entry });
}

/** Best-effort mapping from a manifest worker key to a concrete URL. */
function workerToPath(worker, ctx) {
  let route = worker.replace(/^app/, "").replace(/\/page$/, "").replace(/^$/, "/");
  route = route.replace("[slug]", ctx.slug ?? "the-quiet-power-of-typography-driven-design");
  route = route.replace("[username]", ctx.username ?? "ada");
  return route;
}

let cookie = "";

function actionContext(entry, ctx) {
  // Prefer a static route (no dynamic segments) when one is available.
  const workers = Object.keys(entry.workers ?? {});
  const preferred =
    workers.find((w) => !w.includes("[")) ??
    workers.find((w) => w.includes("[slug]") && ctx.slug) ??
    workers[0];
  return workerToPath(preferred, ctx);
}

/**
 * Decode a React flight response body into the values it carries.
 *
 * A `Next-Action` reply contains the action's return value *plus* a re-render of
 * the page it was invoked from, so "the last JSON chunk" is a page fragment, not
 * the result. Every action in this codebase returns `ActionResult`, so prefer the
 * last chunk carrying an `ok` key and fall back to the last plain object.
 */
function decodeFlight(text) {
  const values = [];
  for (const line of text.split("\n")) {
    const match = /^\d+:([\s\S]+)$/.exec(line.trim());
    if (!match) continue;
    let payload = match[1];
    if (payload.startsWith("I") || payload.startsWith("D") || payload.startsWith("E")) {
      payload = payload.slice(1).trim();
    }
    if (payload.startsWith("$")) continue; // reference to another chunk
    try {
      values.push(JSON.parse(payload));
    } catch {
      /* not a plain JSON chunk */
    }
  }
  const results = values.filter(
    (value) => value && typeof value === "object" && !Array.isArray(value) && "ok" in value,
  );
  if (results.length > 0) return { values, payload: results[results.length - 1] };

  const objects = values.filter((value) => value && typeof value === "object" && !Array.isArray(value));
  return { values, payload: objects[0] ?? values[values.length - 1] };
}

async function callAction(name, args = [], ctx = {}) {
  const found = actions.get(name);
  if (!found) throw new Error(`action "${name}" is not in the build manifest`);
  const path = actionContext(found.entry, ctx);

  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Next-Action": found.id,
      "Content-Type": "text/plain;charset=UTF-8",
      Accept: "text/x-component",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(args),
    redirect: "manual",
  });

  const text = await response.text();
  const { payload } = decodeFlight(text);
  return {
    status: response.status,
    path,
    payload,
    redirect: response.headers.get("x-action-redirect"),
    cookies: response.headers.getSetCookie?.() ?? [],
    headers: response.headers,
    text,
  };
}

async function get(path, options = {}) {
  const started = Date.now();
  const response = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    headers: { ...(cookie ? { cookie } : {}), ...(options.headers ?? {}) },
    ...options,
  });
  const body = await response.text();
  return { response, body, ms: Date.now() - started, headers: response.headers };
}

async function page(label, path, expect = {}) {
  try {
    const { response, body, ms } = await get(path);
    const status = expect.status ?? 200;
    if (response.status !== status) {
      check(label, false, `expected ${status}, got ${response.status}`);
      return { response, body };
    }
    for (const needle of expect.contains ?? []) {
      if (!body.includes(needle)) {
        check(label, false, `missing "${needle}"`);
        return { response, body };
      }
    }
    for (const needle of expect.excludes ?? []) {
      if (body.includes(needle)) {
        check(label, false, `should not contain "${needle}"`);
        return { response, body };
      }
    }
    check(label, true, `${response.status} · ${(ms / 1000).toFixed(2)}s · ${Math.round(body.length / 1024)} KB`);
    return { response, body };
  } catch (error) {
    check(label, false, error.message);
    return { response: null, body: "" };
  }
}

console.log(`\n  ${c.bold("Folio smoke test")} ${c.dim(BASE)}`);
console.log(`  ${c.dim(`${actions.size} server actions discovered in the build manifest`)}`);

// ── 0. Endpoint derivation ───────────────────────────────────────────────────
// These are pure-function checks, and they run first because nothing else in this
// suite can catch a mistake here. Neon serves SQL-over-HTTP from `api.<region>`,
// NOT from the database host — but the local dev sidecar is our own code and
// happily accepts whatever endpoint the driver hands it, so a wrong transform
// stays invisible until it 404s against a real Neon project. Assert the real
// shapes here instead.
section("Configuration");

const endpointCases = [
  {
    what: "pooled Neon URL resolves to the region API host",
    input: "postgresql://user:pw@ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
    expect: "https://api.us-east-2.aws.neon.tech/sql",
  },
  {
    what: "direct Neon URL resolves to the same API host",
    input: "postgresql://user:pw@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require",
    expect: "https://api.us-east-2.aws.neon.tech/sql",
  },
  {
    what: "another region resolves correctly",
    input: "postgresql://user:pw@ep-quiet-river-a1b2c3d4-pooler.eu-central-1.aws.neon.tech/folio?sslmode=require",
    expect: "https://api.eu-central-1.aws.neon.tech/sql",
  },
  {
    what: "local dev keeps the sidecar host",
    input: "postgresql://postgres:postgres@127.0.0.1:5433/folio",
    expect: "http://127.0.0.1:5433/sql",
  },
];

for (const testCase of endpointCases) {
  let actual;
  try {
    actual = resolveEndpoint(testCase.input);
  } catch (error) {
    check(testCase.what, false, error.message);
    continue;
  }
  check(testCase.what, actual === testCase.expect, actual === testCase.expect ? actual : `${actual} — expected ${testCase.expect}`);
}

// ── 1. Public surface ────────────────────────────────────────────────────────
section("Public pages");

const seededSlug = "the-quiet-power-of-typography-driven-design";
const home = await page("home renders the feed", "/", { contains: ["Latest stories", "The Quiet Power"] });
await page("explore lists everything", "/explore", { contains: ["Explore"] });
await page("explore filters by tag", "/explore?tag=postgres", { contains: ["tagged", "postgres"] });
await page("explore sorts by trending", "/explore?sort=trending", { contains: ["Everything published on Folio"] });
await page("explore combines tag + sort", "/explore?sort=top&tag=craft", { contains: ["Everything published on Folio"] });
await page("search finds a story", "/search?q=typography", { contains: ["Results for", "Typography"] });
await page("search with no hits degrades well", "/search?q=zzzxqqq", { contains: ["Nothing matched"] });
await page("about page", "/about", { contains: ["gets out of the way", "What we promise writers"] });
await page("reader renders markdown", `/p/${seededSlug}`, { contains: ["<h2", "<p>"] });
await page("reader has no scripts for markdown parsing", `/p/${seededSlug}`, { excludes: ["react-markdown"] });
await page("profile renders", "/u/ada", { contains: ["Ada"] });
await page("unknown slug is a real 404", "/p/definitely-not-a-post", { status: 404 });
await page("unknown profile is a real 404", "/u/nobody-at-all", { status: 404 });
await page("robots.txt", "/robots.txt", { contains: ["Sitemap"] });
await page("sitemap.xml", "/sitemap.xml", { contains: ["<urlset", seededSlug] });

// Cache behaviour: the feed should be a static ISR page, not a fresh SSR render.
const cachedFeed = await get("/");
check(
  "home is served from the static cache",
  /s-maxage|stale-while-revalidate/.test(cachedFeed.headers.get("cache-control") ?? ""),
  cachedFeed.headers.get("cache-control") ?? "no cache-control",
);

// ── 2. API routes ────────────────────────────────────────────────────────────
section("API routes");

const health = await get("/api/health");
try {
  const data = JSON.parse(health.body);
  check("health reports the database", data.ok === true && data.posts > 0, `${data.posts} posts · ${data.latencyMs}ms`);
} catch {
  check("health reports the database", false, health.body.slice(0, 80));
}
check("health is not cached", /no-store/.test(health.headers.get("cache-control") ?? ""));

const anonSession = await get("/api/session");
try {
  const data = JSON.parse(anonSession.body);
  check("session is null when signed out", data.user === null);
} catch {
  check("session is null when signed out", false, anonSession.body.slice(0, 80));
}
check("session response varies by cookie", /cookie/i.test(anonSession.headers.get("vary") ?? ""));
check("session response is private", /private/.test(anonSession.headers.get("cache-control") ?? ""));

// ── 3. Auth ──────────────────────────────────────────────────────────────────
section("Auth");

await page("dashboard redirects signed-out visitors", "/dashboard", { status: 307 });

// `loginAction` is a form action (prevState, FormData), so it is driven through
// the real markup — hidden `$ACTION_*` fields and all — which also proves the
// no-JavaScript path works.
async function loginThroughForm() {
  const html = await (await fetch(`${BASE}/login`)).text();
  const form = /<form[\s\S]*?<\/form>/.exec(html)?.[0] ?? "";
  const body = new FormData();
  for (const tag of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = /name="([^"]*)"/.exec(tag[0])?.[1];
    if (!name) continue;
    const raw = /value="([^"]*)"/.exec(tag[0])?.[1] ?? "";
    body.append(name, raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#x27;/g, "'"));
  }
  body.append("identifier", DEMO_EMAIL);
  body.append("password", DEMO_PASSWORD);
  const response = await fetch(`${BASE}/login`, { method: "POST", body, redirect: "manual" });
  const raw = response.headers.getSetCookie?.() ?? [];
  const session = raw.find((entry) => entry.startsWith("folio_session="));
  return { status: response.status, location: response.headers.get("location"), session };
}

const badLogin = await (async () => {
  const html = await (await fetch(`${BASE}/login`)).text();
  const form = /<form[\s\S]*?<\/form>/.exec(html)?.[0] ?? "";
  const body = new FormData();
  for (const tag of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = /name="([^"]*)"/.exec(tag[0])?.[1];
    if (!name) continue;
    const raw = /value="([^"]*)"/.exec(tag[0])?.[1] ?? "";
    body.append(name, raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  }
  body.append("identifier", DEMO_EMAIL);
  body.append("password", "definitely-the-wrong-password");
  const response = await fetch(`${BASE}/login`, { method: "POST", body, redirect: "manual" });
  return { status: response.status, cookies: response.headers.getSetCookie?.() ?? [] };
})();
check("wrong password sets no session", !badLogin.cookies.some((entry) => entry.startsWith("folio_session=")), `HTTP ${badLogin.status}`);

const good = await loginThroughForm();
check("login sets an httpOnly session cookie", Boolean(good.session), `HTTP ${good.status} → ${good.location ?? "-"}`);
if (good.session) {
  cookie = good.session.split(";")[0];
  check("session cookie is httpOnly + sameSite", /httponly/i.test(good.session) && /samesite/i.test(good.session));
}

const session = await get("/api/session");
try {
  const data = JSON.parse(session.body);
  check("session reports the signed-in user", data.user?.email === DEMO_EMAIL, `${data.user?.username ?? "?"}`);
} catch {
  check("session reports the signed-in user", false, session.body.slice(0, 80));
}

await page("dashboard loads for the author", "/dashboard", { contains: ["Creator dashboard", "Your stories"] });
await page("settings page loads", "/dashboard/settings", { contains: ["Your public profile", "Display name"] });
await page("library loads", "/library", { contains: ["Saved for later", "History"] });
await page("editor loads", "/write", { contains: ["Write a story"] });

// ── 4. Publishing lifecycle ──────────────────────────────────────────────────
section("Publishing lifecycle");

const created = await callAction("createDraftAction", [], {});
check("createDraftAction returns a draft", created.payload?.ok === true && Boolean(created.payload.data?.id), created.payload?.data?.slug ?? JSON.stringify(created.payload).slice(0, 90));
const postId = created.payload?.data?.id;
const draftSlug = created.payload?.data?.slug;

const silent = await get(`/p/${draftSlug}`);
check("a draft is not publicly readable", silent.response?.status === 404, `HTTP ${silent.response?.status}`);

if (postId) {
  const title = `Smoke test ${new Date().toISOString().slice(11, 19)}`;
  const body = [
    "# " + title,
    "",
    "A short paragraph written by the smoke test to exercise the editor pipeline.",
    "",
    "## A heading",
    "",
    "- one bullet",
    "- another bullet",
    "",
    "> A quote that should survive sanitisation.",
    "",
    "`inline code` and a [link](https://example.com) round it out.",
  ].join("\n");

  const saved = await callAction(
    "savePostAction",
    [postId, { title, subtitle: "Written by npm run smoke", content: body, tags: ["testing", "smoke"], wordCount: 62, readingMinutes: 1 }],
    { slug: draftSlug },
  );
  check("savePostAction persists the draft", saved.payload?.ok === true, `wordCount ${saved.payload?.data?.wordCount ?? "?"}`);

  const preview = await callAction("previewAction", [body], { slug: draftSlug });
  check("previewAction renders markdown server-side", preview.payload?.data?.html?.includes("<h2") === true);

  const emptyPublish = await callAction("publishPostAction", [postId, { title: "Untitled", content: "", wordCount: 0, readingMinutes: 0 }], { slug: draftSlug });
  check("publishing an empty post is refused", emptyPublish.payload?.ok === false, emptyPublish.payload?.error);

  const published = await callAction("publishPostAction", [postId, { title, subtitle: "Written by npm run smoke", content: body, tags: ["testing", "smoke"], wordCount: 62, readingMinutes: 1 }], { slug: draftSlug });
  check("publishPostAction publishes", published.payload?.ok === true, published.payload?.data?.slug);

  // Metadata rides along in the same autosave patch as the body — this is the
  // exact call the editor makes while the writer types.
  const meta = await callAction(
    "savePostAction",
    [postId, { title, subtitle: "Updated by the smoke test", content: body, tags: ["testing", "smoke", "quality"], coverPreset: "dusk", wordCount: 62, readingMinutes: 1 }],
    { slug: draftSlug },
  );
  check("autosave carries metadata with the body", meta.payload?.ok === true, `status ${meta.payload?.data?.status}`);

  const republished = await callAction("publishPostAction", [postId, { title, subtitle: "Updated by the smoke test", content: body, tags: ["testing", "smoke", "quality"], wordCount: 62, readingMinutes: 1 }], { slug: draftSlug });
  check("republishing an edited story succeeds", republished.payload?.ok === true);

  const live = await page("published story is readable", `/p/${draftSlug}`, { contains: [title, "A heading", "Updated by the smoke test"] });
  check("markdown features survived", live.body.includes("<ul>") && live.body.includes("<blockquote>") && live.body.includes("inline code"));
  check("external links are hardened", /rel="noopener noreferrer/.test(live.body));

  const afterPublish = await get("/");
  check("the new story reaches the home feed", afterPublish.body.includes(title));
  const exploreHit = await get("/explore?tag=quality");
  check("the new tags are queryable", exploreHit.body.includes(title));

  // ── 5. Engagement ──────────────────────────────────────────────────────────
  section("Engagement");

  const engagement = await callAction("getEngagementAction", [postId]);
  check("engagement snapshot loads", engagement.payload?.ok === true, JSON.stringify(engagement.payload?.data ?? {}).slice(0, 90));

  const clapped = await callAction("clapAction", [postId, 7], { slug: draftSlug });
  check("clapAction records claps", clapped.payload?.ok === true && clapped.payload.data.yourClaps === 7, `total ${clapped.payload?.data?.clapCount}`);

  const clappedAgain = await callAction("clapAction", [postId, 7], { slug: draftSlug });
  check("clapping twice is idempotent", clappedAgain.payload?.data?.clapCount === clapped.payload?.data?.clapCount, `still ${clappedAgain.payload?.data?.clapCount}`);

  const overClap = await callAction("clapAction", [postId, 999], { slug: draftSlug });
  check("claps are capped at 50", overClap.payload?.data?.yourClaps === 50, `${overClap.payload?.data?.yourClaps}`);

  const comment = await callAction("commentAction", [postId, "A comment from the smoke test."], { slug: draftSlug });
  check("commentAction posts a comment", comment.payload?.ok === true, `count ${comment.payload?.data?.commentCount}`);
  const commentId = comment.payload?.data?.id;

  if (commentId) {
    const reply = await callAction("commentAction", [postId, "And a reply.", commentId], { slug: draftSlug });
    check("replies thread onto a parent", reply.payload?.ok === true);

    const comments = await callAction("listCommentsAction", [postId], { slug: draftSlug });
    const list = comments.payload?.data ?? [];
    const root = list.find((node) => node.body === "A comment from the smoke test.");
    check("listCommentsAction returns the thread", Boolean(root) && root.replies?.length === 1, `${list.length} root comments`);

    const removed = await callAction("deleteCommentAction", [commentId], { slug: draftSlug });
    check("deleteCommentAction removes the author's comment", removed.payload?.ok === true);
  }

  const bookmarked = await callAction("bookmarkAction", [postId], { slug: draftSlug });
  check("bookmarkAction toggles on", bookmarked.payload?.data?.bookmarked === true);
  const library = await page("saved story appears in the library", "/library", { contains: [title] });
  check("library page rendered with the bookmark", library.body.includes(title));
  const unbookmarked = await callAction("bookmarkAction", [postId], { slug: draftSlug });
  check("bookmarkAction toggles off", unbookmarked.payload?.data?.bookmarked === false);

  const followed = await callAction("followAction", ["ada"], { slug: draftSlug });
  const refollowed = await callAction("followAction", ["ada"], { slug: draftSlug });
  check(
    "followAction toggles both ways",
    typeof followed.payload?.data?.following === "boolean" &&
      refollowed.payload?.data?.following === !followed.payload.data.following,
    `${followed.payload?.data?.following} → ${refollowed.payload?.data?.following}`,
  );

  const beacon = await fetch(`${BASE}/api/beacon`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ postId, seconds: 25, ratio: 0.6, progress: 0.6 }),
  });
  const beaconPayload = await beacon.json().catch(() => ({}));
  check("beacon records reading time", beacon.status === 200 && beaconPayload.ok === true, `views ${beaconPayload.viewCount ?? "?"}`);

  const badBeacon = await fetch(`${BASE}/api/beacon`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postId: "not-a-uuid" }),
  });
  check("beacon rejects malformed input", badBeacon.status === 400);

  // "1 live · 0 draft" is rendered as `{count} live · {count} draft`, and React
  // inserts comment separators between a text chunk and an adjacent expression —
  // so the raw HTML reads `1<!-- --> live · <!-- -->0`. Assert on the text chunk
  // itself, not on the digits that hug an expression boundary.
  await page("the new story appears on the author dashboard", "/dashboard", { contains: [title, " live · "] });

  // ── 6. Teardown ────────────────────────────────────────────────────────────
  section("Unpublish + delete");

  const unpublished = await callAction("unpublishPostAction", [postId], { slug: draftSlug });
  check("unpublishPostAction reverts to draft", unpublished.payload?.ok === true);
  const gone = await get(`/p/${draftSlug}`);
  check("unpublished story is no longer public", gone.response?.status === 404, `HTTP ${gone.response?.status}`);

  const deleted = await callAction("deletePostAction", [postId], { slug: draftSlug });
  check("deletePostAction removes the post", deleted.payload?.ok === true);
  const removed = await get(`/p/${draftSlug}`);
  check("deleted story is gone for good", removed.response?.status === 404);
}

// ── 7. Anonymous gates ───────────────────────────────────────────────────────
section("Auth gates");

const savedCookie = cookie;
cookie = "";
const anonClap = await callAction("clapAction", [seededSlug, 1]);
check("anonymous claps ask for auth", anonClap.payload?.ok === false && anonClap.payload?.requiresAuth === true);
const anonWrite = await callAction("createDraftAction");
check("anonymous writing asks for auth", anonWrite.payload?.ok === false && anonWrite.payload?.requiresAuth === true);
const anonBookmark = await callAction("bookmarkAction", [seededSlug]);
check("anonymous bookmarks ask for auth", anonBookmark.payload?.ok === false && anonBookmark.payload?.requiresAuth === true);
cookie = savedCookie;

const usernameCheck = await callAction("checkUsernameAction", ["ada"]);
check("username check reports taken", usernameCheck.payload?.available === false, usernameCheck.payload?.reason);
const freeUsername = await callAction("checkUsernameAction", [`smoke${Date.now().toString(36)}`]);
check("username check reports available", freeUsername.payload?.available === true);

// ── 8. Logout ────────────────────────────────────────────────────────────────
section("Logout");

const logout = await callAction("logoutAction");
check("logoutAction succeeds", logout.status === 200 || logout.status === 303, `HTTP ${logout.status}`);
const cleared = logout.cookies.find((entry) => entry.startsWith("folio_session=")) ?? "";
check("logout expires the session cookie", /Max-Age=0/i.test(cleared) || /^folio_session=;/.test(cleared), cleared.split(";")[0] || "no Set-Cookie");

const afterLogout = await get("/api/session");
try {
  const data = JSON.parse(afterLogout.body);
  check("session is gone after logout", data.user === null);
} catch {
  check("session is gone after logout", false, afterLogout.body.slice(0, 80));
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log("");
if (failed === 0) {
  console.log(`  ${c.green(`${passed} checks passed`)}\n`);
} else {
  console.log(`  ${c.red(`${failed} of ${passed + failed} checks failed`)}`);
  for (const label of failures) console.log(`    ${c.red("·")} ${label}`);
  console.log("");
}
process.exit(failed === 0 ? 0 : 1);
