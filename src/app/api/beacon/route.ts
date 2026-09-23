/**
 * Reader heartbeat — `POST /api/beacon`
 *
 * Called with `navigator.sendBeacon`, which cannot set request headers, so this
 * is a Route Handler rather than a Server Action (actions are dispatched by the
 * `Next-Action` header and are therefore unreachable from sendBeacon).
 *
 * Runs on the Edge runtime: the handler contains no Node APIs at all, and the
 * Neon HTTP driver plus Web Crypto are both native there. That keeps the
 * heartbeat off the main serverless function and close to the reader.
 */
import { NextResponse } from "next/server";
import { recordProgress, recordReading } from "@/db/queries/social";
import { viewerHash } from "@/lib/auth/tokens";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

interface BeaconBody {
  postId?: string;
  seconds?: number;
  ratio?: number;
  progress?: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let body: BeaconBody;
  try {
    body = (await request.json()) as BeaconBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed beacon" }, { status: 400 });
  }

  const postId = String(body.postId ?? "");
  if (!UUID_PATTERN.test(postId)) {
    return NextResponse.json({ ok: false, error: "Unknown post" }, { status: 400 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  // A visitor who is signed in gets one identity across devices; everyone else is
  // counted per (ip, user-agent) pair. See `viewerHash` for the privacy argument.
  const user = await getSession().catch(() => null);
  const hash = await viewerHash(ip, request.headers.get("user-agent") ?? "", user?.id ?? null);

  try {
    const viewCount = await recordReading({
      postId,
      viewerHash: hash,
      userId: user?.id ?? null,
      seconds: Number(body.seconds) || 0,
      ratio: Number(body.ratio) || 0,
      referrer: request.headers.get("referer") ?? "",
    });

    if (user && typeof body.progress === "number" && body.progress > 0) {
      await recordProgress(postId, user.id, body.progress).catch(() => undefined);
    }

    return NextResponse.json(
      { ok: true, viewCount },
      // Telemetry responses are never cacheable and never revalidated.
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    // A dropped heartbeat costs one data point. Never surface an error to a reader.
    return NextResponse.json({ ok: true, viewCount: null }, { headers: { "cache-control": "no-store" } });
  }
}
