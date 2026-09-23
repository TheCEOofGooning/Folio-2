import Link from "next/link";
import type { Metadata } from "next";
import { Editor } from "@/components/editor/editor";
import { requireUser } from "@/lib/auth/session";
import { getDrafts, getOrCreateEmptyDraft } from "@/db/queries/posts";
import { relativeTime } from "@/lib/utils";
import { NewDraftButton } from "@/components/editor/new-draft-button";
import { PenIcon } from "@/components/ui/icons";

/**
 * New story.
 *
 * The editor always has a stable `postId` to autosave against, so there is no
 * "unsaved new post" state to get wrong. Getting there is a *read*: this route
 * reuses the writer's newest untouched draft instead of inserting a row on every
 * visit. (Writing during render would mean a prefetch — or a crawler — could leave
 * empty drafts behind, and it made a render-time `revalidatePath` necessary, which
 * Next rejects outright.)
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Write a story",
  robots: { index: false, follow: false },
};

export default async function WritePage() {
  const user = await requireUser();

  const [post, drafts] = await Promise.all([
    getOrCreateEmptyDraft(user.id),
    getDrafts(user.id, 8).catch(() => []),
  ]);

  const others = drafts.filter((draft) => draft.id !== post.id);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
      <Editor post={post} />

      {others.length > 0 ? (
        <section className="mt-16 border-t border-line pt-8">
          <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Other drafts
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {others.map((draft) => (
              <li key={draft.id}>
                <Link
                  href={`/write/${draft.slug}`}
                  className="inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-[0.8125rem] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                >
                  <PenIcon className="size-3.5" />
                  {draft.title}
                  <span className="text-ink-faint">{relativeTime(draft.updatedAt)}</span>
                </Link>
              </li>
            ))}
            <li>
              <NewDraftButton />
            </li>
          </ul>
        </section>
      ) : null}
    </div>
  );
}
