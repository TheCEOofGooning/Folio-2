"use client";

/**
 * A row in the creator's post table, with the actions that manage it.
 *
 * Destructive actions go through a confirmation dialog that names the post and
 * states what actually happens (deletion is a hard delete and cascades to claps,
 * comments and reader history). Two taps for something irreversible, one tap for
 * something you can undo.
 */
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/modal";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { ArrowUpRightIcon, EyeIcon, PenIcon, TrashIcon, UsersIcon } from "@/components/ui/icons";
import { deletePostAction, unpublishPostAction } from "@/server/actions/posts";
import { formatNumber, relativeTime } from "@/lib/utils";
import type { AnalyticsRow } from "@/db/types";

export function PostRow({ row }: { row: AnalyticsRow }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const completion = Math.round((row.completionRate ?? 0) * 100);
  const averageRead = row.avgReadSeconds ?? 0;

  const act = async (action: "unpublish" | "delete") => {
    setBusy(action);
    const result = action === "unpublish" ? await unpublishPostAction(row.postId) : await deletePostAction(row.postId);
    setBusy(null);
    setConfirming(false);
    if (result.ok) startTransition(() => router.refresh());
  };

  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-4 pr-4 align-top">
        <div className="flex items-start gap-3">
          {row.status === "published" ? (
            <Avatar
              user={{ displayName: row.title, avatarUrl: null, avatarHue: (row.title.charCodeAt(0) * 7) % 360 }}
              size="xs"
              className="mt-0.5"
            />
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={row.status === "draft" ? `/write/${row.slug}` : `/p/${row.slug}`}
                className="font-medium text-ink transition-opacity hover:opacity-75"
              >
                {row.title}
              </Link>
              {row.status === "draft" ? <Badge tone="draft">Draft</Badge> : null}
              {row.status === "unlisted" ? <Badge>Unlisted</Badge> : null}
            </div>
            <p className="mt-1 text-xs text-ink-faint">
              {row.publishedAt
                ? `Published ${relativeTime(row.publishedAt)}`
                : `Edited ${relativeTime(row.publishedAt ?? new Date().toISOString())}`}
              {" · "}
              <Link href={`/p/${row.slug}`} className="underline decoration-line underline-offset-2 hover:text-ink-muted">
                /p/{row.slug}
              </Link>
            </p>
          </div>
        </div>
      </td>

      <td className="hidden py-4 pr-4 align-top text-sm tabular-nums text-ink-muted sm:table-cell">
        {formatNumber(row.views)}
      </td>
      <td className="hidden py-4 pr-4 align-top text-sm tabular-nums text-ink-muted sm:table-cell">
        {formatNumber(row.claps)}
      </td>
      <td className="hidden py-4 pr-4 align-top text-sm tabular-nums text-ink-muted md:table-cell">
        {averageRead > 0 ? `${Math.round(averageRead / 60)}m ${averageRead % 60}s` : "—"}
      </td>
      <td className="hidden py-4 pr-4 align-top md:table-cell">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-paper-sunken" aria-hidden>
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.min(100, completion)}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-ink-faint">{completion}%</span>
        </div>
      </td>
      <td className="py-4 align-top text-right">
        <Dropdown>
          <DropdownTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.title}`}>
              <span aria-hidden className="text-lg leading-none">
                ⋯
              </span>
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            {row.status === "published" ? (
              <DropdownItem asChild>
                <Link href={`/p/${row.slug}`}>
                  <ArrowUpRightIcon /> View story
                </Link>
              </DropdownItem>
            ) : null}
            <DropdownItem asChild>
              <Link href={`/write/${row.slug}`}>
                <PenIcon /> Edit
              </Link>
            </DropdownItem>
            {row.readingNow > 0 ? (
              <DropdownItem disabled>
                <UsersIcon /> {row.readingNow} reading now
              </DropdownItem>
            ) : null}
            {row.status === "published" ? (
              <>
                <DropdownSeparator />
                <DropdownItem onSelect={() => void act("unpublish")} disabled={busy !== null}>
                  <EyeIcon /> Unpublish
                </DropdownItem>
              </>
            ) : null}
            <DropdownSeparator />
            <DropdownItem danger onSelect={() => setConfirming(true)}>
              <TrashIcon /> Delete…
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      </td>

      <Modal open={confirming} onOpenChange={setConfirming}>
        <ModalContent size="sm">
          <ModalHeader
            title="Delete this story?"
            description={`"${row.title}" will be removed permanently, along with its claps, responses and reader history. Unpublishing keeps it as a draft instead.`}
          />
          <ModalBody className="text-sm text-ink-muted">
            <p>
              Views so far: <span className="text-ink">{formatNumber(row.views)}</span> · claps:{" "}
              <span className="text-ink">{formatNumber(row.claps)}</span>
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy !== null}>
              Keep it
            </Button>
            {row.status === "published" ? (
              <Button variant="secondary" onClick={() => void act("unpublish")} disabled={busy !== null}>
                Unpublish instead
              </Button>
            ) : null}
            <Button
              variant="danger"
              loading={busy === "delete" || pending}
              onClick={() => void act("delete")}
            >
              Delete permanently
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </tr>
  );
}
