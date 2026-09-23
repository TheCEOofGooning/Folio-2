"use server";

/**
 * Publishing Server Actions — create, autosave, publish, unpublish, delete.
 *
 * Every mutation re-checks ownership in SQL rather than trusting the client, and
 * every cache invalidation is issued from the same place as the write. That
 * pairing is why publishing feels instant: the response already reflects the
 * change, and the ISR pages are refreshed on the way out.
 */
import { revalidatePath, updateTag } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { analyzeContent } from "@/lib/markdown";
import { clampText, normalizeTags, sanitizeImageUrl } from "@/lib/validation";
import { slugify } from "@/lib/utils";
import {
  createPost,
  deletePost,
  getPostOwnership,
  updatePost,
} from "@/db/queries/posts";
import { recomputeTagStats } from "@/db/queries/tags";
import { MAX_TITLE_LENGTH, MAX_CONTENT_LENGTH, type EditorPatch } from "@/lib/editor-types";
import { CACHE_TAGS } from "@/db/cached";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  /** Set when the visitor needs to sign in — the UI opens a dialog instead of redirecting. */
  requiresAuth?: boolean;
  data?: T;
}

function sanitizePatch(patch: EditorPatch) {
  const content = clampText(patch.content ?? "", MAX_CONTENT_LENGTH);
  const analysis = analyzeContent(content);

  return {
    title: clampText(patch.title ?? "", MAX_TITLE_LENGTH) || "Untitled",
    subtitle: clampText(patch.subtitle ?? "", 240),
    content,
    excerpt: analysis.excerpt,
    tags: normalizeTags(patch.tags ?? []),
    coverImage: sanitizeImageUrl(patch.coverImage),
    coverPreset: clampText(patch.coverPreset ?? "linen", 20),
    wordCount: analysis.wordCount,
    readingMinutes: analysis.readingMinutes,
  };
}

/**
 * Refreshes every cached surface a published post can appear on.
 *
 * Two mechanisms, because Folio caches at two levels:
 *  • `updateTag` expires the *data cache* entries immediately. It is the Next 16
 *    primitive for read-your-own-writes inside a Server Action — which is exactly
 *    the requirement: an author who hits publish must see their story on the home
 *    page on the very next render, not in 60 seconds.
 *  • `revalidatePath` drops the rendered *route* cache for the affected pages.
 *
 * `recomputeTagStats` keeps the footer/explore aggregate in step with the new
 * post; it is one statement over a table with a handful of rows.
 */
async function revalidatePostSurfaces(username: string, slug: string) {
  updateTag(CACHE_TAGS.posts);
  updateTag(CACHE_TAGS.tags);
  updateTag(CACHE_TAGS.authors);

  revalidatePath("/");
  revalidatePath("/explore");
  revalidatePath("/dashboard");
  revalidatePath("/library");
  revalidatePath(`/u/${username}`);
  revalidatePath(`/p/${slug}`);

  await recomputeTagStats().catch(() => undefined);
}

/**
 * Server-side Markdown preview.
 *
 * The editor's preview pane asks the server to render instead of importing the
 * renderer into the client bundle. It keeps `lib/markdown.ts` (~4 KB) out of the
 * browser entirely, guarantees the preview is byte-identical to the published
 * article (same function, same escaping), and costs one round trip only when the
 * writer actually asks to preview.
 */
export async function previewAction(content: string): Promise<ActionResult<{ html: string }>> {
  const user = await getSession();
  if (!user) return { ok: false, requiresAuth: true, error: "Your session expired." };

  const { renderMarkdown } = await import("@/lib/markdown");
  return { ok: true, data: { html: renderMarkdown(clampText(content, MAX_CONTENT_LENGTH)) } };
}

export async function createDraftAction(): Promise<ActionResult<{ id: string; slug: string }>> {
  const user = await getSession();
  if (!user) return { ok: false, requiresAuth: true, error: "Sign in to start writing." };

  const base = slugify(`untitled-${new Date().toISOString().slice(0, 10)}`);
  const post = await createPost(user.id, base, { title: "Untitled", status: "draft" });

  revalidatePath("/dashboard");
  return { ok: true, data: { id: post.id, slug: post.slug } };
}

/** Autosave. Called on a debounce from the editor; returns the server timestamp. */
export async function savePostAction(
  postId: string,
  patch: EditorPatch,
): Promise<ActionResult<{ updatedAt: string; status: string; wordCount: number; readingMinutes: number }>> {
  const user = await getSession();
  if (!user) return { ok: false, requiresAuth: true, error: "Your session expired." };

  const sanitized = sanitizePatch(patch);
  const updated = await updatePost(postId, user.id, sanitized);
  if (!updated) return { ok: false, error: "We couldn't find that draft." };

  return {
    ok: true,
    data: {
      updatedAt: updated.updatedAt,
      status: updated.status,
      wordCount: sanitized.wordCount,
      readingMinutes: sanitized.readingMinutes,
    },
  };
}

/** Save + publish in one call, so the published body is always the saved body. */
export async function publishPostAction(
  postId: string,
  patch: EditorPatch,
): Promise<ActionResult<{ slug: string; status: string }>> {
  const user = await getSession();
  if (!user) return { ok: false, requiresAuth: true, error: "Your session expired." };

  const sanitized = sanitizePatch(patch);
  if (sanitized.wordCount < 1) {
    return { ok: false, error: "Write something first — an empty post can't be published." };
  }
  if (sanitized.title === "Untitled") {
    return { ok: false, error: "Give your piece a title before publishing." };
  }

  const updated = await updatePost(postId, user.id, { ...sanitized, status: "published" });
  if (!updated) return { ok: false, error: "We couldn't find that draft." };

  await revalidatePostSurfaces(user.username, updated.slug);
  return { ok: true, data: { slug: updated.slug, status: updated.status } };
}

export async function unpublishPostAction(postId: string): Promise<ActionResult> {
  const user = await getSession();
  if (!user) return { ok: false, requiresAuth: true, error: "Your session expired." };

  const updated = await updatePost(postId, user.id, { status: "draft" });
  if (!updated) return { ok: false, error: "We couldn't find that post." };

  await revalidatePostSurfaces(user.username, updated.slug);
  return { ok: true };
}

export async function deletePostAction(postId: string): Promise<ActionResult> {
  const user = await getSession();
  if (!user) return { ok: false, requiresAuth: true, error: "Your session expired." };

  const ownership = await getPostOwnership(postId);
  if (!ownership || ownership.authorId !== user.id) {
    return { ok: false, error: "That post isn't yours to delete." };
  }

  const deleted = await deletePost(postId, user.id);
  if (!deleted) return { ok: false, error: "Nothing was deleted." };

  await revalidatePostSurfaces(user.username, ownership.slug);
  return { ok: true };
}

/**
 * Ensures the signed-in author owns this slug, creating an empty draft if the
 * editor is opened cold. Returns the post id the editor should autosave to.
 */
export async function resolveEditorPostAction(
  slug: string | null,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const user = await getSession();
  if (!user) return { ok: false, requiresAuth: true, error: "Sign in to write." };

  if (!slug) {
    const created = await createDraftAction();
    return created;
  }

  const { getPostOwnershipBySlug } = await import("@/db/queries/posts");
  const existing = await getPostOwnershipBySlug(slug);
  if (!existing) return { ok: false, error: "That draft no longer exists." };
  if (existing.authorId !== user.id) return { ok: false, error: "That draft belongs to someone else." };

  return { ok: true, data: { id: existing.id, slug: existing.slug } };
}
