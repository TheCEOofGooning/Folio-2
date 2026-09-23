"use server";

/**
 * Reader interaction Server Actions: claps, bookmarks, follows, comments and the
 * reading heartbeat.
 *
 * None of them redirect. An anonymous reader who taps "clap" gets a sign-in
 * dialog, not a navigation — losing your place in an article to authenticate is
 * the single most avoidable exit in a publishing product.
 */
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { clampText } from "@/lib/validation";
import { MAX_COMMENT_LENGTH } from "@/lib/editor-types";
import {
  addComment,
  getEngagement,
  deleteComment,
  getComments,
  getBookmarkedPosts,
  getReadingHistory,
  setClap,
  toggleBookmark,
  toggleFollow,
} from "@/db/queries/social";
import type { ActionResult } from "./posts";

export interface EngagementSnapshot {
  claps: number;
  views: number;
  comments: number;
  yourClaps: number;
  bookmarked: boolean;
  followingAuthor: boolean;
}

/** Personalises the static article page for a signed-in reader. */
export async function getEngagementAction(
  postId: string,
): Promise<ActionResult<EngagementSnapshot>> {
  const user = await getSession();
  const data = await getEngagement(postId, user?.id ?? null);
  if (!data) return { ok: false, error: "That story is no longer available." };
  return { ok: true, data };
}

// ── Claps ────────────────────────────────────────────────────────────────────

export async function clapAction(
  postId: string,
  total: number,
): Promise<ActionResult<{ clapCount: number; yourClaps: number }>> {
  const user = await getSession();
  if (!user) return { ok: false, requiresAuth: true, error: "Sign in to clap." };

  const gate = rateLimit(`clap:${user.id}`, 120, 60);
  if (!gate.allowed) return { ok: false, error: "Slow down a moment." };

  const result = await setClap(postId, user.id, total);
  if (!result) return { ok: false, error: "That story is no longer available." };

  // The article page is ISR-cached; refresh it in the background so other readers
  // see the new total on their next load without us blocking this response.
  revalidatePath("/");
  return { ok: true, data: result };
}

// ── Bookmarks ────────────────────────────────────────────────────────────────

export async function bookmarkAction(
  postId: string,
): Promise<ActionResult<{ bookmarked: boolean }>> {
  const user = await getSession();
  if (!user) return { ok: false, requiresAuth: true, error: "Sign in to save stories." };

  const bookmarked = await toggleBookmark(postId, user.id);
  revalidatePath("/library");
  return { ok: true, data: { bookmarked } };
}

export async function listBookmarksAction(): Promise<ActionResult<Awaited<ReturnType<typeof getBookmarkedPosts>>>> {
  const user = await getSession();
  if (!user) return { ok: false, requiresAuth: true, error: "Sign in to see your library." };
  return { ok: true, data: await getBookmarkedPosts(user.id) };
}

export async function listHistoryAction(): Promise<ActionResult<Awaited<ReturnType<typeof getReadingHistory>>>> {
  const user = await getSession();
  if (!user) return { ok: false, requiresAuth: true, error: "Sign in to see your history." };
  return { ok: true, data: await getReadingHistory(user.id) };
}

// ── Follows ──────────────────────────────────────────────────────────────────

export async function followAction(
  username: string,
): Promise<ActionResult<{ following: boolean }>> {
  const user = await getSession();
  if (!user) return { ok: false, requiresAuth: true, error: "Sign in to follow writers." };

  const { getProfile } = await import("@/db/queries/users");
  const profile = await getProfile(username, user.id);
  if (!profile) return { ok: false, error: "That writer no longer exists." };
  if (profile.id === user.id) return { ok: false, error: "You can't follow yourself." };

  const following = await toggleFollow(profile.id, user.id);
  revalidatePath(`/u/${profile.username}`);
  revalidatePath("/dashboard");
  return { ok: true, data: { following } };
}

// ── Comments ─────────────────────────────────────────────────────────────────

export async function listCommentsAction(
  postId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof getComments>>>> {
  return { ok: true, data: await getComments(postId) };
}

export async function commentAction(
  postId: string,
  body: string,
  parentId: string | null = null,
): Promise<ActionResult<{ id: string; commentCount: number; createdAt: string }>> {
  const user = await getSession();
  if (!user) return { ok: false, requiresAuth: true, error: "Sign in to join the conversation." };

  const text = clampText(body, MAX_COMMENT_LENGTH).trim();
  if (text.length < 2) return { ok: false, error: "Your comment is a little short." };

  const gate = rateLimit(`comment:${user.id}`, 12, 300);
  if (!gate.allowed) {
    return { ok: false, error: `You're commenting quickly. Try again in ${gate.retryAfterSeconds}s.` };
  }

  const created = await addComment(postId, user.id, text, parentId);
  if (!created) return { ok: false, error: "That story is no longer available." };

  revalidatePath("/dashboard");
  return { ok: true, data: { id: created.id, commentCount: created.commentCount, createdAt: created.createdAt } };
}

export async function deleteCommentAction(commentId: string): Promise<ActionResult> {
  const user = await getSession();
  if (!user) return { ok: false, requiresAuth: true, error: "Sign in first." };

  const result = await deleteComment(commentId, user.id);
  if (!result) return { ok: false, error: "You can't remove that comment." };

  revalidatePath("/dashboard");
  return { ok: true };
}

// ── Reading telemetry ────────────────────────────────────────────────────────
//
// The heartbeat is NOT a server action. `navigator.sendBeacon` cannot attach the
// `Next-Action` header that identifies an action, so telemetry lives at
// `src/app/api/beacon/route.ts` — an Edge Route Handler that reuses the same
// `recordReading` / `recordProgress` query functions. Server actions handle
// intent (clap, save, follow); route handlers handle machine-to-machine writes.
