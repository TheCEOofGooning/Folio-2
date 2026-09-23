import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Editor } from "@/components/editor/editor";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { sql, maybe } from "@/db";
import type { EditorPostRow } from "@/db/queries/posts";

/**
 * Edit an existing story.
 *
 * Ownership is enforced in SQL (`author_id = viewer`), not by a redirect after
 * fetching — a draft that isn't yours simply does not exist as far as this route
 * is concerned.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit story",
  robots: { index: false, follow: false },
};

export default async function EditStoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();

  const post = await maybe<EditorPostRow>(sql`
    select p.id, p.slug, p.title, p.subtitle, p.content, p.tags,
           p.cover_image as "coverImage", p.cover_preset as "coverPreset",
           p.status, p.updated_at as "updatedAt", p.published_at as "publishedAt"
      from posts p
     where p.slug = ${slug}
       and p.author_id = ${user.id}::uuid
  `);

  if (!post) {
    return notFound();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
      <Editor post={post} />
      <p className="mt-10 text-center text-xs text-ink-faint">
        This story lives at{" "}
        <Link
          href={`/p/${post.slug}`}
          className="text-ink-muted underline decoration-line underline-offset-2 hover:text-ink"
        >
          /p/{post.slug}
        </Link>{" "}
        — the URL is stable across edits.
      </p>
    </div>
  );
}
