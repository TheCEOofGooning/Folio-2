/**
 * Liveness + database probe — `GET /api/health`
 *
 * Useful as a Vercel uptime check: it exercises the real query path (HTTP driver →
 * pooled Neon endpoint) rather than just proving the function booted, and it
 * reports the round-trip so you can see connection-pool health over time.
 */
import { NextResponse } from "next/server";
import { sql } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    const rows = await sql<{ posts: number; authors: number; version: string }>`
      select (select count(*)::int from posts where status = 'published') as posts,
             (select count(*)::int from users)                            as authors,
             current_setting('server_version')                            as version
    `;
    return NextResponse.json(
      {
        ok: true,
        database: "reachable",
        latencyMs: Date.now() - startedAt,
        posts: rows[0]?.posts ?? 0,
        authors: rows[0]?.authors ?? 0,
        engine: `postgres ${rows[0]?.version ?? "unknown"}`,
      },
      // A probe whose answer is cached is not a probe.
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        database: "unreachable",
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "unknown error",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
