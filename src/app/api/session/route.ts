/**
 * Viewer bootstrap — `GET /api/session`
 *
 * Folio's public pages are static or ISR-cached, which means they cannot read
 * cookies during render (that would opt the whole route into dynamic rendering).
 * Instead the shell renders signed-out, and one small client provider fetches the
 * viewer state here after hydration. Signed-out visitors — the overwhelming
 * majority of traffic on a publishing site — get a static page and this request
 * returns `{ user: null }` from the Edge cache without touching Postgres.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSession().catch(() => null);

  return NextResponse.json(
    { user },
    {
      headers: {
        // Private because it is per-cookie; no-store because a stale identity is a
        // correctness bug (sign out must take effect immediately).
        "cache-control": "private, no-store, max-age=0",
        vary: "cookie",
      },
    },
  );
}
